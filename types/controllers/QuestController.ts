import { inject, injectable } from "tsyringe";

import { DialogueHelper } from "../helpers/DialogueHelper";
import { ItemHelper } from "../helpers/ItemHelper";
import { ProfileHelper } from "../helpers/ProfileHelper";
import { QuestConditionHelper } from "../helpers/QuestConditionHelper";
import { QuestHelper } from "../helpers/QuestHelper";
import { IPmcData } from "../models/eft/common/IPmcData";
import { Quest } from "../models/eft/common/tables/IBotBase";
import { IQuest, Reward } from "../models/eft/common/tables/IQuest";
import { IRepeatableQuest } from "../models/eft/common/tables/IRepeatableQuests";
import { IItemEventRouterResponse } from "../models/eft/itemEvent/IItemEventRouterResponse";
import { IAcceptQuestRequestData } from "../models/eft/quests/IAcceptQuestRequestData";
import { ICompleteQuestRequestData } from "../models/eft/quests/ICompleteQuestRequestData";
import { IFailQuestRequestData } from "../models/eft/quests/IFailQuestRequestData";
import { IHandoverQuestRequestData } from "../models/eft/quests/IHandoverQuestRequestData";
import { ConfigTypes } from "../models/enums/ConfigTypes";
import { MessageType } from "../models/enums/MessageType";
import { QuestStatus } from "../models/enums/QuestStatus";
import { IQuestConfig } from "../models/spt/config/IQuestConfig";
import { ILogger } from "../models/spt/utils/ILogger";
import { EventOutputHolder } from "../routers/EventOutputHolder";
import { ConfigServer } from "../servers/ConfigServer";
import { DatabaseServer } from "../servers/DatabaseServer";
import { LocaleService } from "../services/LocaleService";
import { LocalisationService } from "../services/LocalisationService";
import { PlayerService } from "../services/PlayerService";
import { HttpResponseUtil } from "../utils/HttpResponseUtil";
import { TimeUtil } from "../utils/TimeUtil";

@injectable()
export class QuestController
{
    protected questConfig: IQuestConfig;

    constructor(
        @inject("WinstonLogger") protected logger: ILogger,
        @inject("TimeUtil") protected timeUtil: TimeUtil,
        @inject("HttpResponseUtil") protected httpResponseUtil: HttpResponseUtil,
        @inject("EventOutputHolder") protected eventOutputHolder: EventOutputHolder,
        @inject("DatabaseServer") protected databaseServer: DatabaseServer,
        @inject("ItemHelper") protected itemHelper: ItemHelper,
        @inject("DialogueHelper") protected dialogueHelper: DialogueHelper,
        @inject("ProfileHelper") protected profileHelper: ProfileHelper,
        @inject("QuestHelper") protected questHelper: QuestHelper,
        @inject("QuestConditionHelper") protected questConditionHelper: QuestConditionHelper,
        @inject("PlayerService") protected playerService: PlayerService,
        @inject("LocaleService") protected localeService: LocaleService,
        @inject("LocalisationService") protected localisationService: LocalisationService,
        @inject("ConfigServer") protected configServer: ConfigServer
    )
    {
        this.questConfig = this.configServer.getConfig(ConfigTypes.QUEST);
    }


    /**
     * Get all quests visible to player
     * Exclude quests with incomplete preconditions (level/loyalty)
     * @param sessionID session id
     * @returns array of IQuest
     */
    public getClientQuests(sessionID: string): IQuest[]
    {
        const quests: IQuest[] = [];
        const allQuests = this.questHelper.getQuestsFromDb();
        const profile: IPmcData = this.profileHelper.getPmcProfile(sessionID);

        for (const quest of allQuests)
        {
            // If a quest is already in the profile we need to just add it
            if (profile.Quests.some(x => x.qid === quest._id))
            {
                quests.push(quest);
                continue;
            }

            if (this.questIsForOtherSide(profile.Info.Side, quest._id))
            {
                continue;
            }

            // Don't add quests that have a level higher than the user's
            const levelConditions = this.questConditionHelper.getLevelConditions(quest.conditions.AvailableForStart);
            if (levelConditions.length)
            {
                let skipQuest = false;
                for (const levelCondition of levelConditions)
                {
                    if (!this.questHelper.doesPlayerLevelFulfilCondition(profile.Info.Level, levelCondition))
                    {
                        skipQuest = true;
                        break;
                    }
                }

                if (skipQuest)
                {
                    continue;
                }
            }

            const questRequirements = this.questConditionHelper.getQuestConditions(quest.conditions.AvailableForStart);
            const loyaltyRequirements = this.questConditionHelper.getLoyaltyConditions(quest.conditions.AvailableForStart);

            // If the quest has no quest/loyalty conditions then add to visible quest list
            if (questRequirements.length === 0 && loyaltyRequirements.length === 0)
            {
                quests.push(quest);
                continue;
            }

            // Check the status of each quest condition, if any are not completed
            // then this quest should not be visible
            let haveCompletedPreviousQuest = true;
            for (const condition of questRequirements)
            {
                const previousQuest = profile.Quests.find(pq => pq.qid === condition._props.target);

                // If the previous quest isn't in the user profile, it hasn't been completed or started
                if (!previousQuest)
                {
                    haveCompletedPreviousQuest = false;
                    break;
                }

                // If previous is in user profile, check condition requirement and current status
                if (condition._props.status.includes(previousQuest.status))
                {
                    continue;
                }

                // Chemical fix: "Started" Status is catered for above. This will include it just if it's started.
                // but maybe this is better:
                // if ((condition._props.status[0] === QuestStatus.Started)
                // && (previousQuest.status === "AvailableForFinish" || previousQuest.status ===  "Success")
                if ((condition._props.status[0] === QuestStatus.Started))
                {
                    const statusName = Object.keys(QuestStatus)[condition._props.status[0]];
                    this.logger.debug(`[QUESTS]: fix for polikhim bug: ${quest._id} (${this.questHelper.getQuestNameFromLocale(quest._id)}) ${condition._props.status[0]}, ${statusName} != ${previousQuest.status}`);
                    continue;
                }
                haveCompletedPreviousQuest = false;
                break;
            }

            let passesLoyaltyRequirements = true;
            for (const condition of loyaltyRequirements)
            {
                if (!this.questHelper.traderStandingRequirementCheck(condition._props, profile))
                {
                    passesLoyaltyRequirements = false;
                    break;
                }
            }

            if (haveCompletedPreviousQuest && passesLoyaltyRequirements)
            {
                quests.push(quest);
            }
        }

        return quests;
    }

    /**
     * Is the quest for the opposite side the player is on
     * @param side player side (usec/bear)
     * @param questId questId to check
     */
    protected questIsForOtherSide(side: string, questId: string): boolean
    {
        const isUsec = side.toLowerCase() === "usec";
        if (isUsec && this.questConfig.bearOnlyQuests.includes(questId))
        {
            // player is usec and quest is bear only, skip
            return true;
        }

        if (!isUsec && this.questConfig.usecOnlyQuests.includes(questId))
        {
            // player is bear and quest is usec only, skip
            return true;
        }

        return false;
    }

    /**
     * Handle the client accepting a quest and starting it
     * Send starting rewards if any to player and
     * Send start notification if any to player
     * @param pmcData Profile to update
     * @param acceptedQuest Quest accepted
     * @param sessionID Session id
     * @returns client response
     */
    public acceptQuest(pmcData: IPmcData, acceptedQuest: IAcceptQuestRequestData, sessionID: string): IItemEventRouterResponse
    {
        const acceptQuestResponse = this.eventOutputHolder.getOutput(sessionID);

        const startedState = QuestStatus.Started;
        const newQuest = this.questHelper.getQuestReadyForProfile(pmcData, startedState, acceptedQuest);

        // Does quest exist in profile
        if (pmcData.Quests.find(x => x.qid === acceptedQuest.qid))
        {
            // Update existing
            this.questHelper.updateQuestState(pmcData, QuestStatus.Started, acceptedQuest.qid);
        }
        else
        {
            // Add new quest to server profile
            pmcData.Quests.push(newQuest);
        }

        // Create a dialog message for starting the quest.
        // Note that for starting quests, the correct locale field is "description", not "startedMessageText".
        const questFromDb = this.questHelper.getQuestFromDb(acceptedQuest.qid, pmcData);
        // Get messageId of text to send to player as text message in game
        const messageId = this.getMessageIdForQuestStart(questFromDb.startedMessageText, questFromDb.description);
        const messageContent = this.dialogueHelper.createMessageContext(messageId, MessageType.QUEST_START, this.questConfig.redeemTime);

        const startedQuestRewards = this.questHelper.applyQuestReward(pmcData, acceptedQuest.qid, QuestStatus.Started, sessionID, acceptQuestResponse);
        this.dialogueHelper.addDialogueMessage(questFromDb.traderId, messageContent, sessionID, startedQuestRewards);

        acceptQuestResponse.profileChanges[sessionID].quests = this.questHelper.acceptedUnlocked(acceptedQuest.qid, sessionID);

        return acceptQuestResponse;
    }

    /**
     * Get a quests startedMessageText key from db, if no startedMessageText key found, use description key instead
     * @param startedMessageTextId startedMessageText property from IQuest
     * @param questDescriptionId description property from IQuest
     * @returns message id
     */
    protected getMessageIdForQuestStart(startedMessageTextId: string, questDescriptionId: string): string
    {
        // blank or is a guid, use description instead
        const startedMessageText = this.questHelper.getQuestLocaleIdFromDb(startedMessageTextId);
        if (!startedMessageText || startedMessageText.trim() === "" || startedMessageText.toLowerCase() === "test" || startedMessageText.length === 24)
        {
            return questDescriptionId;
        }

        return startedMessageTextId;
    }

    /**
     * Handle the client accepting a repeatable quest and starting it
     * Send starting rewards if any to player and
     * Send start notification if any to player
     * @param pmcData Profile to update with new quest
     * @param acceptedQuest Quest being accepted
     * @param sessionID Session id
     * @returns IItemEventRouterResponse
     */
    public acceptRepeatableQuest(pmcData: IPmcData, acceptedQuest: IAcceptQuestRequestData, sessionID: string): IItemEventRouterResponse
    {
        const acceptQuestResponse = this.eventOutputHolder.getOutput(sessionID);

        const state = QuestStatus.Started;
        const newQuest = this.questHelper.getQuestReadyForProfile(pmcData, state, acceptedQuest);
        pmcData.Quests.push(newQuest);

        const repeatableQuestProfile = this.getRepeatableQuestFromProfile(pmcData, acceptedQuest);

        if (!repeatableQuestProfile)
        {
            this.logger.error(this.localisationService.getText("repeatable-accepted_repeatable_quest_not_found_in_active_quests", acceptedQuest.qid));

            throw new Error(this.localisationService.getText("repeatable-unable_to_accept_quest_see_log"));
        }

        const locale = this.localeService.getLocaleDb();
        const questStartedMessageKey = this.getMessageIdForQuestStart(repeatableQuestProfile.startedMessageText, repeatableQuestProfile.description);

        // Can be started text or description text based on above function result
        let questStartedMessageText = locale[questStartedMessageKey];
        // TODO: remove this whole if statement, possibly not required?
        if (!questStartedMessageText)
        {
            this.logger.debug(`Unable to accept quest ${acceptedQuest.qid}, cannot find the quest started message text with id ${questStartedMessageKey}. attempting to find it in en locale instead`);

            // For some reason non-en locales dont have repeatable quest ids, fall back to en and grab it if possible
            const enLocale = this.databaseServer.getTables().locales.global["en"];
            questStartedMessageText = enLocale[repeatableQuestProfile.startedMessageText];

            if (!questStartedMessageText)
            {
                this.logger.error(this.localisationService.getText("repeatable-unable_to_accept_quest_starting_message_not_found", {questId: acceptedQuest.qid, messageId: questStartedMessageKey}));

                return this.httpResponseUtil.appendErrorToOutput(acceptQuestResponse, this.localisationService.getText("repeatable-unable_to_accept_quest_see_log"));
            }
        }

        const questRewards = this.questHelper.getQuestRewardItems(<IQuest><unknown>repeatableQuestProfile, state);
        const messageContent = this.dialogueHelper.createMessageContext(questStartedMessageKey, MessageType.QUEST_START, this.questConfig.redeemTime);

        this.dialogueHelper.addDialogueMessage(repeatableQuestProfile.traderId, messageContent, sessionID, questRewards);

        acceptQuestResponse.profileChanges[sessionID].quests = this.questHelper.acceptedUnlocked(acceptedQuest.qid, sessionID);
        return acceptQuestResponse;
    }

    /**
     * Look for an accepted quest inside player profile, return matching
     * @param pmcData Profile to search through
     * @param acceptedQuest Quest to search for
     * @returns IRepeatableQuest
     */
    protected getRepeatableQuestFromProfile(pmcData: IPmcData, acceptedQuest: IAcceptQuestRequestData): IRepeatableQuest
    {
        let result: IRepeatableQuest;
        for (const repeatable of pmcData.RepeatableQuests)
        {
            result = repeatable.activeQuests.find(x => x._id === acceptedQuest.qid);
            if (result)
            {
                this.logger.debug(`Accepted repeatable quest ${acceptedQuest.qid} from ${repeatable.name}`);
                break;
            }
        }

        return result;
    }

    /**
     * Update completed quest in profile
     * Add newly unlocked quests to profile
     * Also recalculate thier level due to exp rewards
     * @param pmcData Player profile
     * @param body Completed quest request
     * @param sessionID Session id
     * @returns ItemEvent client response
     */
    public completeQuest(pmcData: IPmcData, body: ICompleteQuestRequestData, sessionID: string): IItemEventRouterResponse
    {
        const completeQuestResponse = this.eventOutputHolder.getOutput(sessionID);

        const completedQuestId = body.qid;
        const beforeQuests = this.getClientQuests(sessionID); // Must be gathered prior to applyQuestReward() & failQuests()

        const newQuestState = QuestStatus.Success;
        this.questHelper.updateQuestState(pmcData, newQuestState, completedQuestId);
        const questRewards = this.questHelper.applyQuestReward(pmcData, body.qid, newQuestState, sessionID, completeQuestResponse);

        // Check if any of linked quest is failed, and that is unrestartable.
        const questsToFail = this.getQuestsFailedByCompletingQuest(completedQuestId);
        if (questsToFail && questsToFail.length > 0)
        {
            this.failQuests(sessionID, pmcData, questsToFail);
        }

        // Show modal on player screen
        this.sendSuccessDialogMessageOnQuestComplete(sessionID, pmcData, completedQuestId, questRewards);

        // Add diff of quests before completion vs after to client response
        const questDelta = this.questHelper.getDeltaQuests(beforeQuests, this.getClientQuests(sessionID));
        completeQuestResponse.profileChanges[sessionID].quests = questDelta;

        this.addTimeLockedQuestsToProfile(pmcData, questDelta, body.qid);

        // Update trader info data on response
        Object.assign(completeQuestResponse.profileChanges[sessionID].traderRelations, pmcData.TradersInfo);

        // Check if it's a repeatable quest. If so remove from Quests and repeatable.activeQuests list to repeatable.inactiveQuests
        for (const currentRepeatable of pmcData.RepeatableQuests)
        {
            const repeatableQuest = currentRepeatable.activeQuests.find(x => x._id === completedQuestId);
            if (repeatableQuest)
            {
                currentRepeatable.activeQuests = currentRepeatable.activeQuests.filter(x => x._id !== completedQuestId);
                currentRepeatable.inactiveQuests.push(repeatableQuest);
            }
        }

        // Recalculate level in event player leveled up
        pmcData.Info.Level = this.playerService.calculateLevel(pmcData);

        return completeQuestResponse;
    }

    /**
     * Send a popup to player on successful completion of a quest
     * @param sessionID session id
     * @param pmcData Player profile
     * @param completedQuestId Completed quest id
     * @param questRewards Rewards given to player
     */
    protected sendSuccessDialogMessageOnQuestComplete(sessionID: string, pmcData: IPmcData, completedQuestId: string, questRewards: Reward[]): void
    {
        const quest = this.questHelper.getQuestFromDb(completedQuestId, pmcData);
        const messageContent = this.dialogueHelper.createMessageContext(quest.successMessageText, MessageType.QUEST_SUCCESS, this.questConfig.redeemTime);

        this.dialogueHelper.addDialogueMessage(quest.traderId, messageContent, sessionID, questRewards);
    }

    /**
     * Look for newly available quests after completing a quest with a requirement to wait x minutes (time-locked) before being available and add data to profile
     * @param pmcData Player profile to update
     * @param quests Quests to look for wait conditions in
     * @param completedQuestId Quest just completed
     */
    protected addTimeLockedQuestsToProfile(pmcData: IPmcData, quests: IQuest[], completedQuestId: string): void
    {
        // Iterate over quests, look for quests with right criteria
        for (const quest of quests)
        {
            // If newly available quest has prereq of completed quest + availableAfter value > 0 (quest has wait time)
            const nextQuestWaitCondition = quest.conditions.AvailableForStart.find(x => x._props.target === completedQuestId && x._props.availableAfter > 0);
            if (nextQuestWaitCondition)
            {
                const availableAfterTimestamp = this.timeUtil.getTimestamp() + nextQuestWaitCondition._props.availableAfter;

                // Add/update quest to profile with status of AvailableAfter
                const existingQuestInProfile = pmcData.Quests.find(x => x.qid === quest._id);
                if (existingQuestInProfile)
                {
                    existingQuestInProfile.availableAfter = availableAfterTimestamp;
                    existingQuestInProfile.status = QuestStatus.Locked;
                    existingQuestInProfile.startTime = 0;
                    existingQuestInProfile.statusTimers = {};

                    continue;
                }

                pmcData.Quests.push({
                    qid: quest._id,
                    startTime: 0,
                    status: QuestStatus.Locked,
                    statusTimers: {},
                    availableAfter: availableAfterTimestamp
                });
            }
        }
    }

    /**
     * Returns a list of quests that should be failed when a quest is completed
     * @param completedQuestId quest completed id
     * @returns array of quests
     */
    protected getQuestsFailedByCompletingQuest(completedQuestId: string): IQuest[]
    {
        return this.questHelper.getQuestsFromDb().filter((x) =>
        {
            // No fail conditions, exit early
            if (!x.conditions.Fail || x.conditions.Fail.length === 0)
            {
                return false;
            }

            for (const failCondition of x.conditions.Fail)
            {
                if (failCondition._props.target === completedQuestId)
                {
                    return true;
                }
            }

            return false;
        });
    }

    /**
     * Fail the quests provided
     * Update quest in profile, otherwise add fresh quest object with failed status
     * @param sessionID session id
     * @param pmcData player profile
     * @param questsToFail quests to fail
     */
    protected failQuests(sessionID: string, pmcData: IPmcData, questsToFail: IQuest[]): void
    {
        for (const questToFail of questsToFail)
        {
            if (questToFail.conditions.Fail[0]._props.status[0] !== QuestStatus.Success)
            {
                continue;
            }

            const isActiveQuestInPlayerProfile = pmcData.Quests.find(y => y.qid === questToFail._id);
            if (isActiveQuestInPlayerProfile)
            {
                const failBody: IFailQuestRequestData = {
                    Action: "QuestComplete",
                    qid: questToFail._id,
                    removeExcessItems: true
                };
                this.questHelper.failQuest(pmcData, failBody, sessionID);
            }
            else
            {
                const questData: Quest = {
                    qid: questToFail._id,
                    startTime: this.timeUtil.getTimestamp(),
                    status: QuestStatus.Fail
                };
                pmcData.Quests.push(questData);
            }
        }
    }

    public handoverQuest(pmcData: IPmcData, body: IHandoverQuestRequestData, sessionID: string): IItemEventRouterResponse
    {
        const quest = this.questHelper.getQuestFromDb(body.qid, pmcData);
        const types = ["HandoverItem", "WeaponAssembly"];
        const output = this.eventOutputHolder.getOutput(sessionID);
        let handoverMode = true;
        let value = 0;
        let counter = 0;
        let amount: number;

        for (const condition of quest.conditions.AvailableForFinish)
        {
            if (condition._props.id === body.conditionId && types.includes(condition._parent))
            {
                value = condition._props.value;
                handoverMode = condition._parent === types[0];

                const profileCounter = (body.conditionId in pmcData.BackendCounters)
                    ? pmcData.BackendCounters[body.conditionId].value
                    : 0;
                value -= profileCounter;

                if (value <= 0)
                {
                    this.logger.error(this.localisationService.getText("repeatable-quest_handover_failed_condition_already_satisfied", {questId: body.qid, conditionId: body.conditionId, profileCounter: profileCounter, value: value}));

                    return output;
                }

                break;
            }
        }

        if (handoverMode && value === 0)
        {
            this.logger.error(this.localisationService.getText("repeatable-quest_handover_failed_condition_invalid", {questId: body.qid, conditionId: body.conditionId}));

            return output;
        }

        for (const itemHandover of body.items)
        {
            // remove the right quantity of given items
            amount = Math.min(itemHandover.count, value - counter);
            counter += amount;
            if (itemHandover.count - amount > 0)
            {
                this.questHelper.changeItemStack(pmcData, itemHandover.id, itemHandover.count - amount, sessionID, output);
                if (counter === value)
                {
                    break;
                }
            }
            else
            {
                // for weapon handover quests, remove the item and its children.
                const toRemove = this.itemHelper.findAndReturnChildrenByItems(pmcData.Inventory.items, itemHandover.id);
                let index = pmcData.Inventory.items.length;

                // important: don't tell the client to remove the attachments, it will handle it
                output.profileChanges[sessionID].items.del.push({ "_id": itemHandover.id });

                // important: loop backward when removing items from the array we're looping on
                while (index-- > 0)
                {
                    if (toRemove.includes(pmcData.Inventory.items[index]._id))
                    {
                        pmcData.Inventory.items.splice(index, 1);
                    }
                }
            }
        }

        this.updateProfileBackendCounterValue(pmcData, body.conditionId, body.qid, counter);

        return output;
    }

    /**
     * Increment a backend counter stored value by an amount,
     * Create counter if it does not exist
     * @param pmcData Profile to find backend counter in
     * @param conditionId backend counter id to update
     * @param questId quest id counter is associated with
     * @param counterValue value to increment the backend counter with
     */
    protected updateProfileBackendCounterValue(pmcData: IPmcData, conditionId: string, questId: string, counterValue: number): void
    {
        if (pmcData.BackendCounters[conditionId] !== undefined)
        {
            pmcData.BackendCounters[conditionId].value += counterValue;
            return;
        }

        pmcData.BackendCounters[conditionId] = { 
            "id": conditionId,
            "qid": questId,
            "value": counterValue };
    }
}