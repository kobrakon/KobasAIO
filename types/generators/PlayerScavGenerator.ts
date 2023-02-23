import { inject, injectable } from "tsyringe";

import { BotGeneratorHelper } from "../helpers/BotGeneratorHelper";
import { BotHelper } from "../helpers/BotHelper";
import { BotWeaponGeneratorHelper } from "../helpers/BotWeaponGeneratorHelper";
import { ItemHelper } from "../helpers/ItemHelper";
import { ProfileHelper } from "../helpers/ProfileHelper";
import { IPmcData } from "../models/eft/common/IPmcData";
import { Settings, Skills, Stats } from "../models/eft/common/tables/IBotBase";
import { IBotType } from "../models/eft/common/tables/IBotType";
import { Item } from "../models/eft/common/tables/IItem";
import { ConfigTypes } from "../models/enums/ConfigTypes";
import { Traders } from "../models/enums/Traders";
import { IPlayerScavConfig, KarmaLevel } from "../models/spt/config/IPlayerScavConfig";
import { ILogger } from "../models/spt/utils/ILogger";
import { ConfigServer } from "../servers/ConfigServer";
import { DatabaseServer } from "../servers/DatabaseServer";
import { SaveServer } from "../servers/SaveServer";
import { BotLootCacheService } from "../services/BotLootCacheService";
import { FenceService } from "../services/FenceService";
import { LocalisationService } from "../services/LocalisationService";
import { HashUtil } from "../utils/HashUtil";
import { JsonUtil } from "../utils/JsonUtil";
import { RandomUtil } from "../utils/RandomUtil";
import { BotGenerator } from "./BotGenerator";

@injectable()
export class PlayerScavGenerator
{
    protected playerScavConfig: IPlayerScavConfig;

    constructor(
        @inject("WinstonLogger") protected logger: ILogger,
        @inject("RandomUtil") protected randomUtil: RandomUtil,
        @inject("DatabaseServer") protected databaseServer: DatabaseServer,
        @inject("HashUtil") protected hashUtil: HashUtil,
        @inject("ItemHelper") protected itemHelper: ItemHelper,
        @inject("BotWeaponGeneratorHelper") protected botWeaponGeneratorHelper: BotWeaponGeneratorHelper,
        @inject("BotGeneratorHelper") protected botGeneratorHelper: BotGeneratorHelper,
        @inject("SaveServer") protected saveServer: SaveServer,
        @inject("ProfileHelper") protected profileHelper: ProfileHelper,
        @inject("BotHelper") protected botHelper: BotHelper,
        @inject("JsonUtil") protected jsonUtil: JsonUtil,
        @inject("FenceService") protected fenceService: FenceService,
        @inject("BotLootCacheService") protected botLootCacheService: BotLootCacheService,
        @inject("LocalisationService") protected localisationService: LocalisationService,
        @inject("BotGenerator") protected botGenerator: BotGenerator,
        @inject("ConfigServer") protected configServer: ConfigServer
    )
    {
        this.playerScavConfig = this.configServer.getConfig(ConfigTypes.PLAYERSCAV);
    }

    /**
     * Update a player profile to include a new player scav profile
     * @param sessionID session id to specify what profile is updated
     * @returns profile object
     */
    public generate(sessionID: string): IPmcData
    {
        // get karma level from profile
        const profile = this.saveServer.getProfile(sessionID);
        const pmcData = profile.characters.pmc;
        const existingScavData = profile.characters.scav;

        // scav profile can be empty on first profile creation
        const scavKarmaLevel = ((Object.keys(existingScavData).length === 0)) 
            ? 0
            : this.getScavKarmaLevel(pmcData);

        // use karma level to get correct karmaSettings
        const playerScavKarmaSettings = this.playerScavConfig.karmaLevel[scavKarmaLevel];
        if (!playerScavKarmaSettings)
        {
            this.logger.error(this.localisationService.getText("scav-missing_karma_settings", scavKarmaLevel));
        }

        this.logger.debug(`generated player scav loadout with karma level ${scavKarmaLevel}`);

        // edit baseBotNode values
        const baseBotNode: IBotType = this.constructBotBaseTemplate(playerScavKarmaSettings.botTypeForLoot);
        this.adjustBotTemplateWithKarmaSpecificSettings(playerScavKarmaSettings, baseBotNode);

        let scavData = this.botGenerator.generatePlayerScav(sessionID, playerScavKarmaSettings.botTypeForLoot.toLowerCase(), "easy", baseBotNode);
        this.botLootCacheService.clearCache();

        // add scav metadata
        scavData._id = pmcData.savage;
        scavData.aid = sessionID;
        scavData.Info.Settings = {} as Settings;
        scavData.TradersInfo = this.jsonUtil.clone(pmcData.TradersInfo);
        scavData.Skills = this.getScavSkills(existingScavData);
        scavData.Stats = this.getScavStats(existingScavData);
        scavData.Info.Level = this.getScavLevel(existingScavData);
        scavData.Info.Experience = this.getScavExperience(existingScavData);

        // Add an extra labs card to pscav backpack based on config chance
        if (this.randomUtil.getChance100(playerScavKarmaSettings.labsAccessCardChancePercent))
        {
            const labsCard = this.itemHelper.getItem("5c94bbff86f7747ee735c08f")[1];
            const itemsToAdd: Item[] = [{
                _id: this.hashUtil.generate(),
                _tpl: labsCard._id,
                ...this.botGeneratorHelper.generateExtraPropertiesForItem(labsCard)
            }];
            this.botWeaponGeneratorHelper.addItemWithChildrenToEquipmentSlot(["TacticalVest", "Pockets", "Backpack"], itemsToAdd[0]._id, labsCard._id, itemsToAdd, scavData.Inventory);
        }

        // remove secure container
        scavData = this.profileHelper.removeSecureContainer(scavData);

        // set cooldown timer
        scavData = this.setScavCooldownTimer(scavData, pmcData);

        // add scav to the profile
        this.saveServer.getProfile(sessionID).characters.scav = scavData;

        return scavData;
    }

    /**
     * Get the scav karama level for a profile
     * Is also the fence trader rep level
     * @param pmcData pmc profile
     * @returns karma level
     */
    protected getScavKarmaLevel(pmcData: IPmcData): number
    {
        const fenceInfo = pmcData.TradersInfo[Traders.FENCE];

        // Can be empty during profile creation
        if (!fenceInfo)
        {
            this.logger.warning(this.localisationService.getText("scav-missing_karma_level_getting_default"));

            return 0;
        }

        if (fenceInfo.standing > 6)
        {
            return 6;
        }

        // e.g. 2.09 becomes 2
        return Math.floor(fenceInfo.standing);
    }

    /**
     * Get a baseBot template
     * If the parameter doesnt match "assault", take parts from the loot type and apply to the return bot template
     * @param botTypeForLoot bot type to use for inventory/chances
     * @returns IBotType object
     */
    protected constructBotBaseTemplate(botTypeForLoot: string): IBotType
    {
        const baseScavType = "assault";
        const assaultBase = this.jsonUtil.clone(this.botHelper.getBotTemplate(baseScavType));

        // Loot bot is same as base bot, return base with no modification
        if (botTypeForLoot === baseScavType)
        {
            return assaultBase;
        }

        const lootBase = this.jsonUtil.clone(this.botHelper.getBotTemplate(botTypeForLoot));
        assaultBase.inventory = lootBase.inventory;
        assaultBase.chances = lootBase.chances;
        assaultBase.generation = lootBase.generation;

        return assaultBase;
    }

    /**
     * Adjust equipment/mod/item generation values based on scav karma levels
     * @param karmaSettings Values to modify the bot template with
     * @param baseBotNode bot template to modify according to karama level settings
     */
    protected adjustBotTemplateWithKarmaSpecificSettings(karmaSettings: KarmaLevel, baseBotNode: IBotType): void
    {
        // Adjust equipment chance values
        for (const equipmentKey in karmaSettings.modifiers.equipment)
        {
            if (karmaSettings.modifiers.equipment[equipmentKey] === 0)
            {
                continue;
            }

            baseBotNode.chances.equipment[equipmentKey] += karmaSettings.modifiers.equipment[equipmentKey];
        }

        // Adjust mod chance values
        for (const modKey in karmaSettings.modifiers.mod)
        {
            if (karmaSettings.modifiers.mod[modKey] === 0)
            {
                continue;
            }

            baseBotNode.chances.mods[modKey] += karmaSettings.modifiers.mod[modKey];
        }

        // Adjust item spawn quantity values
        for (const itemLimitkey in karmaSettings.itemLimits)
        {
            baseBotNode.generation.items[itemLimitkey].min = karmaSettings.itemLimits[itemLimitkey].min;
            baseBotNode.generation.items[itemLimitkey].max = karmaSettings.itemLimits[itemLimitkey].max;
        }

        // Blacklist equipment
        for (const equipmentKey in karmaSettings.equipmentBlacklist)
        {
            const blacklistedItemTpls = karmaSettings.equipmentBlacklist[equipmentKey];
            for (const itemToRemove of blacklistedItemTpls)
            {
                delete baseBotNode.inventory.equipment[equipmentKey][itemToRemove];
            }
        }
    }

    protected getScavSkills(scavProfile: IPmcData): Skills
    {
        if (scavProfile.Skills)
        {
            return scavProfile.Skills;
        }

        return this.getDefaultScavSkills();
    }

    protected getDefaultScavSkills(): Skills
    {
        return {
            Common: [],
            Mastering: [],
            Points: 0
        };
    }

    protected getScavStats(scavProfile: IPmcData): Stats
    {
        if (scavProfile.Stats)
        {
            return scavProfile.Stats;
        }

        return this.profileHelper.getDefaultCounters();
    }

    protected getScavLevel(scavProfile: IPmcData): number
    {
        // Info can be null on initial account creation
        if (!(scavProfile.Info?.Level))
        {
            return 1;
        }

        return scavProfile.Info.Level;
    }

    protected getScavExperience(scavProfile: IPmcData): number
    {
        // Info can be null on initial account creation
        if (!(scavProfile.Info?.Experience))
        {
            return 0;
        }

        return scavProfile.Info.Experience;
    }

    /**
     * Set cooldown till pscav is playable
     * take into account scav cooldown bonus
     * @param scavData scav profile
     * @param pmcData pmc profile
     * @returns 
     */
    protected setScavCooldownTimer(scavData: IPmcData, pmcData: IPmcData): IPmcData
    {
        // Set cooldown time.
        // Make sure to apply ScavCooldownTimer bonus from Hideout if the player has it.
        let scavLockDuration = this.databaseServer.getTables().globals.config.SavagePlayCooldown;
        let modifier = 1;

        for (const bonus of pmcData.Bonuses)
        {
            if (bonus.type === "ScavCooldownTimer")
            {
                // Value is negative, so add.
                // Also note that for scav cooldown, multiple bonuses stack additively.
                modifier += bonus.value / 100;
            }
        }

        const fenceInfo = this.fenceService.getFenceInfo(pmcData);
        modifier *= fenceInfo.SavageCooldownModifier;

        scavLockDuration *= modifier;
        scavData.Info.SavageLockTime = (Date.now() / 1000) + scavLockDuration;

        return scavData;
    }
}