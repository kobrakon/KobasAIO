import { inject, injectable } from "tsyringe";

import { PlayerScavGenerator } from "../generators/PlayerScavGenerator";
import { ItemHelper } from "../helpers/ItemHelper";
import { ProfileHelper } from "../helpers/ProfileHelper";
import { QuestHelper } from "../helpers/QuestHelper";
import { TraderHelper } from "../helpers/TraderHelper";
import { IPmcData } from "../models/eft/common/IPmcData";
import { TemplateSide } from "../models/eft/common/tables/IProfileTemplate";
import { IMiniProfile } from "../models/eft/launcher/IMiniProfile";
import { IAkiProfile, Inraid, Vitality } from "../models/eft/profile/IAkiProfile";
import {
    IProfileChangeNicknameRequestData
} from "../models/eft/profile/IProfileChangeNicknameRequestData";
import {
    IProfileChangeVoiceRequestData
} from "../models/eft/profile/IProfileChangeVoiceRequestData";
import { IProfileCreateRequestData } from "../models/eft/profile/IProfileCreateRequestData";
import { ISearchFriendRequestData } from "../models/eft/profile/ISearchFriendRequestData";
import { ISearchFriendResponse } from "../models/eft/profile/ISearchFriendResponse";
import { IValidateNicknameRequestData } from "../models/eft/profile/IValidateNicknameRequestData";
import { QuestStatus } from "../models/enums/QuestStatus";
import { DatabaseServer } from "../servers/DatabaseServer";
import { SaveServer } from "../servers/SaveServer";
import { ProfileFixerService } from "../services/ProfileFixerService";
import { HashUtil } from "../utils/HashUtil";
import { TimeUtil } from "../utils/TimeUtil";

@injectable()
export class ProfileController
{
    constructor(
        @inject("HashUtil") protected hashUtil: HashUtil,
        @inject("TimeUtil") protected timeUtil: TimeUtil,
        @inject("SaveServer") protected saveServer: SaveServer,
        @inject("DatabaseServer") protected databaseServer: DatabaseServer,
        @inject("ItemHelper") protected itemHelper: ItemHelper,
        @inject("ProfileFixerService") protected profileFixerService: ProfileFixerService,
        @inject("PlayerScavGenerator") protected playerScavGenerator: PlayerScavGenerator,
        @inject("TraderHelper") protected traderHelper: TraderHelper,
        @inject("QuestHelper") protected questHelper: QuestHelper,
        @inject("ProfileHelper") protected profileHelper: ProfileHelper
    )
    { }

    public getMiniProfiles(): IMiniProfile[]
    {
        const miniProfiles: IMiniProfile[] = [];

        for (const sessionIdKey in this.saveServer.getProfiles())
        {
            miniProfiles.push(this.getMiniProfile(sessionIdKey));
        }

        return miniProfiles;
    }

    public getMiniProfile(sessionID: string): any
    {
        const maxlvl = this.profileHelper.getMaxLevel();
        const profile = this.saveServer.getProfile(sessionID);
        const pmc = profile.characters.pmc;

        // make sure character completed creation
        if (!(("Info" in pmc) && ("Level" in pmc.Info)))
        {
            return {
                "username": profile.info.username,
                "nickname": "unknown",
                "side": "unknown",
                "currlvl": 0,
                "currexp": 0,
                "prevexp": 0,
                "nextlvl": 0,
                "maxlvl": maxlvl,
                "akiData": this.profileHelper.getDefaultAkiDataObject()
            };
        }

        const currlvl = pmc.Info.Level;
        const nextlvl = this.profileHelper.getExperience(currlvl + 1);
        const result = {
            "username": profile.info.username,
            "nickname": pmc.Info.Nickname,
            "side": pmc.Info.Side,
            "currlvl": pmc.Info.Level,
            "currexp": pmc.Info.Experience,
            "prevexp": (currlvl === 0) ? 0 : this.profileHelper.getExperience(currlvl),
            "nextlvl": nextlvl,
            "maxlvl": maxlvl,
            "akiData": profile.aki
        };

        return result;
    }

    public getCompleteProfile(sessionID: string): IPmcData[]
    {
        return this.profileHelper.getCompleteProfile(sessionID);
    }

    public createProfile(info: IProfileCreateRequestData, sessionID: string): void
    {
        const account = this.saveServer.getProfile(sessionID).info;
        const profile: TemplateSide = this.databaseServer.getTables().templates.profiles[account.edition][info.side.toLowerCase()];
        const pmcData = profile.character;

        // delete existing profile
        if (sessionID in this.saveServer.getProfiles())
        {
            this.saveServer.deleteProfileById(sessionID);
        }

        // pmc
        pmcData._id = `pmc${sessionID}`;
        pmcData.aid = sessionID;
        pmcData.savage = `scav${sessionID}`;
        pmcData.Info.Nickname = info.nickname;
        pmcData.Info.LowerNickname = info.nickname.toLowerCase();
        pmcData.Info.RegistrationDate = this.timeUtil.getTimestamp();
        pmcData.Info.Voice = this.databaseServer.getTables().templates.customization[info.voiceId]._name;
        pmcData.Stats = this.profileHelper.getDefaultCounters();
        pmcData.Customization.Head = info.headId;
        pmcData.Health.UpdateTime = this.timeUtil.getTimestamp();
        pmcData.Quests = [];
        pmcData.RepeatableQuests = [];
        pmcData.CarExtractCounts = {};

        // change item id's to be unique
        pmcData.Inventory.items = this.itemHelper.replaceIDs(pmcData, pmcData.Inventory.items, null, pmcData.Inventory.fastPanel);

        // Create profile
        const profileDetails: IAkiProfile = {
            info: account,
            characters: {
                pmc: pmcData,
                scav: {} as IPmcData
            },
            suits: profile.suits,
            weaponbuilds: profile.weaponbuilds,
            dialogues: profile.dialogues,
            aki: this.profileHelper.getDefaultAkiDataObject(),
            vitality: {} as Vitality,
            inraid: {} as Inraid,
            insurance: [],
            traderPurchases: {}
        };

        this.profileFixerService.checkForAndFixPmcProfileIssues(profileDetails.characters.pmc);
        this.profileFixerService.addMissingHideoutBonusesToProfile(profileDetails.characters.pmc);

        if (profile.trader.setQuestsAvailableForStart)
        {
            this.questHelper.addAllQuestsToProfile(profileDetails.characters.pmc, [QuestStatus.AvailableForStart]);
        }

        if (profile.trader.setQuestsAvailableForFinish)
        {
            this.questHelper.addAllQuestsToProfile(profileDetails.characters.pmc, [QuestStatus.AvailableForFinish]);
        }

        this.saveServer.addProfile(profileDetails);

        this.saveServer.getProfile(sessionID).characters.scav = this.generatePlayerScav(sessionID);

        for (const traderID in this.databaseServer.getTables().traders)
        {
            this.traderHelper.resetTrader(sessionID, traderID);
        }

        // store minimal profile and reload it
        this.saveServer.saveProfile(sessionID);
        this.saveServer.loadProfile(sessionID);

        // completed account creation
        this.saveServer.getProfile(sessionID).info.wipe = false;
        this.saveServer.saveProfile(sessionID);
    }

    /**
     * Generate a player scav object
     * pmc profile MUST exist first before pscav can be generated
     * @param sessionID 
     * @returns IPmcData object
     */
    public generatePlayerScav(sessionID: string): IPmcData
    {
        return this.playerScavGenerator.generate(sessionID);
    }

    public validateNickname(info: IValidateNicknameRequestData, sessionID: string): string
    {
        if (info.nickname.length < 3)
        {
            return "tooshort";
        }

        if (this.profileHelper.isNicknameTaken(info, sessionID))
        {
            return "taken";
        }

        return "OK";
    }

    public changeNickname(info: IProfileChangeNicknameRequestData, sessionID: string): string
    {
        const output = this.validateNickname(info, sessionID);

        if (output === "OK")
        {
            const pmcData = this.profileHelper.getPmcProfile(sessionID);

            pmcData.Info.Nickname = info.nickname;
            pmcData.Info.LowerNickname = info.nickname.toLowerCase();
        }

        return output;
    }

    public changeVoice(info: IProfileChangeVoiceRequestData, sessionID: string): void
    {
        const pmcData = this.profileHelper.getPmcProfile(sessionID);
        pmcData.Info.Voice = info.voice;
    }

    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    public getFriends(info: ISearchFriendRequestData, sessionID: string): ISearchFriendResponse[]
    {
        return [
            {
                _id: this.hashUtil.generate(),
                Info: {
                    Level: 1,
                    Side: "Bear",
                    Nickname: info.nickname
                }
            }
        ];
    }
}