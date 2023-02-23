import { inject, injectable } from "tsyringe";

import { IPmcData } from "../models/eft/common/IPmcData";
import { ITraderAssort } from "../models/eft/common/tables/ITrader";
import { QuestStatus } from "../models/enums/QuestStatus";
import { ILogger } from "../models/spt/utils/ILogger";
import { DatabaseServer } from "../servers/DatabaseServer";
import { LocalisationService } from "../services/LocalisationService";
import { ItemHelper } from "./ItemHelper";
import { QuestHelper } from "./QuestHelper";

@injectable()
export class AssortHelper
{

    constructor(
        @inject("WinstonLogger") protected logger: ILogger,
        @inject("ItemHelper") protected itemHelper: ItemHelper,
        @inject("DatabaseServer") protected databaseServer: DatabaseServer,
        @inject("LocalisationService") protected localisationService: LocalisationService,
        @inject("QuestHelper") protected questHelper: QuestHelper
    )
    { }

    /**
     * Remove assorts from a trader that have not been unlocked yet
     * @param pmcProfile player profile
     * @param traderId traders id
     * @param assort assort items from a trader
     * @param mergedQuestAssorts An object of quest assort to quest id unlocks for all traders
     * @returns assort items minus locked quest assorts
     */
    public stripLockedQuestAssort(pmcProfile: IPmcData, traderId: string, assort: ITraderAssort, mergedQuestAssorts: Record<string, Record<string, string>>, flea = false): ITraderAssort
    {
        // Trader assort does not always contain loyal_level_items
        if (!assort.loyal_level_items)
        {
            this.logger.warning(this.localisationService.getText("assort-missing_loyalty_level_object", traderId));

            return assort;
        }

        for (const assortId in assort.loyal_level_items)
        {
            if (assortId in mergedQuestAssorts.started && this.questHelper.getQuestStatus(pmcProfile, mergedQuestAssorts.started[assortId]) !== QuestStatus.Started)
            {
                assort = this.removeItemFromAssort(assort, assortId, flea);
                continue;
            }

            if (assortId in mergedQuestAssorts.success && this.questHelper.getQuestStatus(pmcProfile, mergedQuestAssorts.success[assortId]) !== QuestStatus.Success)
            {
                assort = this.removeItemFromAssort(assort, assortId, flea);
                continue;
            }

            if (assortId in mergedQuestAssorts.fail && this.questHelper.getQuestStatus(pmcProfile, mergedQuestAssorts.fail[assortId]) !== QuestStatus.Fail)
            {
                assort = this.removeItemFromAssort(assort, assortId, flea);
            }
        }

        return assort;
    }

    /**
     * Remove assorts from a trader that have not been unlocked yet
     * @param pmcProfile player profile
     * @param traderId traders id
     * @param assort traders assorts
     * @returns traders assorts minus locked loyalty assorts
     */
    public stripLockedLoyaltyAssort(pmcProfile: IPmcData, traderId: string, assort: ITraderAssort): ITraderAssort
    {
        // Trader assort does not always contain loyal_level_items
        if (!assort.loyal_level_items)
        {
            this.logger.warning(this.localisationService.getText("assort-missing_loyalty_level_object", traderId));

            return assort;
        }

        for (const itemId in assort.loyal_level_items)
        {
            if (assort.loyal_level_items[itemId] > pmcProfile.TradersInfo[traderId].loyaltyLevel)
            {
                assort = this.removeItemFromAssort(assort, itemId);
            }
        }

        return assort;
    }

    /**
     * Remove an item from an assort
     * @param assort assort to modify
     * @param itemID item id to remove from asort
     * @returns Modified assort
     */
    public removeItemFromAssort(assort: ITraderAssort, itemID: string, flea = false): ITraderAssort
    {
        const idsToRemove = this.itemHelper.findAndReturnChildrenByItems(assort.items, itemID);

        if (assort.barter_scheme[itemID] && flea)
        {
            assort.barter_scheme[itemID].forEach(b => b.forEach(br => br.sptQuestLocked = true));
            return assort;
        }
        delete assort.barter_scheme[itemID];
        delete assort.loyal_level_items[itemID];

        for (const i in idsToRemove)
        {
            for (const a in assort.items)
            {
                if (assort.items[a]._id === idsToRemove[i])
                {
                    assort.items.splice(parseInt(a), 1);
                }
            }
        }

        return assort;
    }
}