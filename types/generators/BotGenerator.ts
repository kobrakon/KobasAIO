import { inject, injectable } from "tsyringe";

import { BotDifficultyHelper } from "../helpers/BotDifficultyHelper";
import { BotHelper } from "../helpers/BotHelper";
import { ProfileHelper } from "../helpers/ProfileHelper";
import { WeightedRandomHelper } from "../helpers/WeightedRandomHelper";
import {
    Common, Health as PmcHealth, IBotBase, Info, Mastering, Skills
} from "../models/eft/common/tables/IBotBase";
import { Health, IBotType } from "../models/eft/common/tables/IBotType";
import { Item, Upd } from "../models/eft/common/tables/IItem";
import { BaseClasses } from "../models/enums/BaseClasses";
import { ConfigTypes } from "../models/enums/ConfigTypes";
import { MemberCategory } from "../models/enums/MemberCategory";
import { BotGenerationDetails } from "../models/spt/bots/BotGenerationDetails";
import { IBotConfig } from "../models/spt/config/IBotConfig";
import { ILogger } from "../models/spt/utils/ILogger";
import { ConfigServer } from "../servers/ConfigServer";
import { DatabaseServer } from "../servers/DatabaseServer";
import { BotEquipmentFilterService } from "../services/BotEquipmentFilterService";
import { SeasonalEventService } from "../services/SeasonalEventService";
import { HashUtil } from "../utils/HashUtil";
import { JsonUtil } from "../utils/JsonUtil";
import { RandomUtil } from "../utils/RandomUtil";
import { BotInventoryGenerator } from "./BotInventoryGenerator";
import { BotLevelGenerator } from "./BotLevelGenerator";

@injectable()
export class BotGenerator
{
    protected botConfig: IBotConfig;

    constructor(
        @inject("WinstonLogger") protected logger: ILogger,
        @inject("HashUtil") protected hashUtil: HashUtil,
        @inject("RandomUtil") protected randomUtil: RandomUtil,
        @inject("JsonUtil") protected jsonUtil: JsonUtil,
        @inject("ProfileHelper") protected profileHelper: ProfileHelper,
        @inject("DatabaseServer") protected databaseServer: DatabaseServer,
        @inject("BotInventoryGenerator") protected botInventoryGenerator: BotInventoryGenerator,
        @inject("BotLevelGenerator") protected botLevelGenerator: BotLevelGenerator,
        @inject("BotEquipmentFilterService") protected botEquipmentFilterService: BotEquipmentFilterService,
        @inject("WeightedRandomHelper") protected weightedRandomHelper: WeightedRandomHelper,
        @inject("BotHelper") protected botHelper: BotHelper,
        @inject("BotDifficultyHelper") protected botDifficultyHelper: BotDifficultyHelper,
        @inject("SeasonalEventService") protected seasonalEventService: SeasonalEventService,
        @inject("ConfigServer") protected configServer: ConfigServer
    )
    {
        this.botConfig = this.configServer.getConfig(ConfigTypes.BOT);
    }

    /**
     * Generate a player scav bot object
     * @param role e.g. assault / pmcbot
     * @param difficulty easy/normal/hard/impossible
     * @param botTemplate base bot template to use  (e.g. assault/pmcbot)
     * @returns 
     */
    public generatePlayerScav(sessionId: string, role: string, difficulty: string, botTemplate: IBotType): IBotBase
    {
        let bot = this.getCloneOfBotBase();
        bot.Info.Settings.BotDifficulty = difficulty;
        bot.Info.Settings.Role = role;
        bot.Info.Side = "Savage";

        const botGenDetails: BotGenerationDetails = {
            isPmc: false,
            side: "Savage",
            role: role,
            playerLevel: 0,
            botRelativeLevelDeltaMax: 0,
            botCountToGenerate: 1,
            botDifficulty: difficulty,
            isPlayerScav: true
        };

        bot = this.generateBot(sessionId, bot, botTemplate, botGenDetails);

        return bot;
    }

    /**
     * Create x number of bots of the type/side/difficulty defined in botGenerationDetails
     * @param sessionId Session id
     * @param botGenerationDetails details on how to generate bots 
     * @returns array of bots
     */
    public prepareAndGenerateBots(
        sessionId: string,
        botGenerationDetails: BotGenerationDetails): IBotBase[]
    {
        const output: IBotBase[] = [];
        for (let i = 0; i < botGenerationDetails.botCountToGenerate; i++)
        {
            let bot = this.getCloneOfBotBase();

            bot.Info.Settings.Role = botGenerationDetails.role;
            bot.Info.Side = botGenerationDetails.side;
            bot.Info.Settings.BotDifficulty = botGenerationDetails.botDifficulty;
    
            // Get raw json data for bot (Cloned)
            const botJsonTemplate = this.jsonUtil.clone(this.botHelper.getBotTemplate(
                (botGenerationDetails.isPmc)
                    ? bot.Info.Side
                    : botGenerationDetails.role));

            bot = this.generateBot(sessionId, bot, botJsonTemplate, botGenerationDetails);
    
            output.push(bot);
        }

        return output;
    }

    /**
     * Get a clone of the database\bots\base.json file
     * @returns IBotBase object
     */
    protected getCloneOfBotBase(): IBotBase
    {
        return this.jsonUtil.clone(this.databaseServer.getTables().bots.base);
    }

    /**
     * Create a IBotBase object with equipment/loot/exp etc
     * @param sessionId Session id
     * @param bot bots base file
     * @param botJsonTemplate Bot template from db/bots/x.json
     * @param botGenerationDetails details on how to generate the bot
     * @returns IBotBase object
     */
    protected generateBot(sessionId: string, bot: IBotBase, botJsonTemplate: IBotType, botGenerationDetails: BotGenerationDetails): IBotBase
    {
        const botRole = botGenerationDetails.role.toLowerCase();
        const botLevel = this.botLevelGenerator.generateBotLevel(botJsonTemplate.experience.level, botGenerationDetails, bot);

        if (!botGenerationDetails.isPlayerScav)
        {
            this.botEquipmentFilterService.filterBotEquipment(botJsonTemplate, botLevel.level, botGenerationDetails);
        }

        bot.Info.Nickname = this.generateBotNickname(botJsonTemplate, botGenerationDetails.isPlayerScav, botRole);

        const skipChristmasItems = !this.seasonalEventService.christmasEventEnabled();
        if (skipChristmasItems)
        {
            this.seasonalEventService.removeChristmasItemsFromBotInventory(botJsonTemplate.inventory, botGenerationDetails.role);
        }

        bot.Info.Experience = botLevel.exp;
        bot.Info.Level = botLevel.level;
        bot.Info.Settings.Experience = this.randomUtil.getInt(botJsonTemplate.experience.reward.min, botJsonTemplate.experience.reward.max);
        bot.Info.Settings.StandingForKill = botJsonTemplate.experience.standingForKill;
        bot.Info.Voice = this.randomUtil.getArrayValue(botJsonTemplate.appearance.voice);
        bot.Health = this.generateHealth(botJsonTemplate.health, bot.Info.Side === "Savage");
        bot.Skills = this.generateSkills(botJsonTemplate.skills);
        bot.Customization.Head = this.randomUtil.getArrayValue(botJsonTemplate.appearance.head);
        bot.Customization.Body = this.weightedRandomHelper.getWeightedInventoryItem(botJsonTemplate.appearance.body);
        bot.Customization.Feet = this.weightedRandomHelper.getWeightedInventoryItem(botJsonTemplate.appearance.feet);
        bot.Customization.Hands = this.randomUtil.getArrayValue(botJsonTemplate.appearance.hands);
        bot.Inventory = this.botInventoryGenerator.generateInventory(sessionId, botJsonTemplate, botRole, botGenerationDetails.isPmc, botLevel.level);

        if (this.botHelper.isBotPmc(botRole))
        {
            this.getRandomisedGameVersionAndCategory(bot.Info);
            bot = this.generateDogtag(bot);
        }

        // generate new bot ID
        bot = this.generateId(bot);

        // generate new inventory ID
        bot = this.generateInventoryID(bot);

        return bot;
    }

    /**
     * Create a bot nickname
     * @param botJsonTemplate x.json from database 
     * @param isPlayerScav Will bot be player scav
     * @param botRole role of bot e.g. assault
     * @returns Nickname for bot
     */
    protected generateBotNickname(botJsonTemplate: IBotType, isPlayerScav: boolean, botRole: string): string
    {
        let name = `${this.randomUtil.getArrayValue(botJsonTemplate.firstName)} ${this.randomUtil.getArrayValue(botJsonTemplate.lastName) || ""}`;
        
        // Simulate bot looking like a Player scav with the pmc name in brackets
        if (botRole === "assault" && this.randomUtil.getChance100(this.botConfig.chanceAssaultScavHasPlayerScavName))
        {
            const pmcNames = [...this.databaseServer.getTables().bots.types["usec"].firstName, ...this.databaseServer.getTables().bots.types["bear"].firstName];

            return `${name} (${this.randomUtil.getArrayValue(pmcNames)})`;
        }

        if (this.botConfig.showTypeInNickname && !isPlayerScav)
        {
            name += ` ${botRole}`;
        }

        return name;
    }

    /**
     * Log the number of PMCs generated to the debug console
     * @param output Generated bot array, ready to send to client
     */
    protected logPmcGeneratedCount(output: IBotBase[]): void
    {
        const pmcCount = output.reduce((acc, cur) => cur.Info.Side === "Bear" || cur.Info.Side === "Usec" ? ++acc : acc, 0);
        this.logger.debug(`Generated ${output.length} total bots. Replaced ${pmcCount} with PMCs`);
    }

    /**
     * Converts health object to the required format
     * @param healthObj health object from bot json
     * @param playerScav Is a pscav bot being generated
     * @returns PmcHealth object
     */
    protected generateHealth(healthObj: Health, playerScav = false): PmcHealth
    {
        const bodyParts = (playerScav)
            ? healthObj.BodyParts[0]
            : this.randomUtil.getArrayValue(healthObj.BodyParts);

        const newHealth: PmcHealth = {
            Hydration: {
                Current: this.randomUtil.getInt(healthObj.Hydration.min, healthObj.Hydration.max),
                Maximum:  healthObj.Hydration.max
            },
            Energy: {
                Current: this.randomUtil.getInt(healthObj.Energy.min, healthObj.Energy.max),
                Maximum: healthObj.Energy.max
            },
            Temperature: {
                Current: this.randomUtil.getInt(healthObj.Temperature.min, healthObj.Temperature.max),
                Maximum: healthObj.Temperature.max
            },
            BodyParts: {
                Head: {
                    Health: {
                        Current: this.randomUtil.getInt(bodyParts.Head.min, bodyParts.Head.max),
                        Maximum: bodyParts.Head.max
                    }
                },
                Chest: {
                    Health: {
                        Current: this.randomUtil.getInt(bodyParts.Chest.min, bodyParts.Chest.max),
                        Maximum: bodyParts.Chest.max
                    }
                },
                Stomach: {
                    Health: {
                        Current: this.randomUtil.getInt(bodyParts.Stomach.min, bodyParts.Stomach.max),
                        Maximum: bodyParts.Stomach.max
                    }
                },
                LeftArm: {
                    Health: {
                        Current: this.randomUtil.getInt(bodyParts.LeftArm.min, bodyParts.LeftArm.max),
                        Maximum: bodyParts.LeftArm.max
                    }
                },
                RightArm: {
                    Health: {
                        Current: this.randomUtil.getInt(bodyParts.RightArm.min, bodyParts.RightArm.max),
                        Maximum: bodyParts.RightArm.max
                    }
                },
                LeftLeg: {
                    Health: {
                        Current: this.randomUtil.getInt(bodyParts.LeftLeg.min, bodyParts.LeftLeg.max),
                        Maximum: bodyParts.LeftLeg.max
                    }
                },
                RightLeg: {
                    Health: {
                        Current: this.randomUtil.getInt(bodyParts.RightLeg.min, bodyParts.RightLeg.max),
                        Maximum: bodyParts.RightLeg.max
                    }
                }
            },
            UpdateTime: 0
        };

        return newHealth;
    }

    protected generateSkills(skillsObj: Skills): Skills
    {
        const skills = [];
        const masteries = [];

        // Skills
        if (skillsObj.Common)
        {
            for (const skillId in skillsObj.Common)
            {
                const skill: Common = {
                    Id: skillId,
                    Progress: this.randomUtil.getInt(skillsObj.Common[skillId].min, skillsObj.Common[skillId].max)
                };

                skills.push(skill);
            }
        }

        // Masteries
        if (skillsObj.Mastering)
        {
            for (const masteringId in skillsObj.Mastering)
            {
                const mastery: Mastering = {
                    Id: masteringId,
                    Progress: this.randomUtil.getInt(skillsObj.Mastering[masteringId].min, skillsObj.Mastering[masteringId].max)
                };
                masteries.push(mastery);
            }
        }

        const skillsToReturn: Skills = {
            Common: skills,
            Mastering: masteries,
            Points: 0
        };

        return skillsToReturn;
    }



    /**
     * Generate a random Id for a bot and apply to bots _id and aid value
     * @param bot bot to update
     * @returns updated IBotBase object
     */
    protected generateId(bot: IBotBase): IBotBase
    {
        const botId = this.hashUtil.generate();

        bot._id = botId;
        bot.aid = botId;
        return bot;
    }

    protected generateInventoryID(profile: IBotBase): IBotBase
    {
        const defaultInventory = "55d7217a4bdc2d86028b456d";
        const itemsByParentHash = {};
        const inventoryItemHash = {};
        let inventoryId = "";

        // Generate inventoryItem list
        for (const item of profile.Inventory.items)
        {
            inventoryItemHash[item._id] = item;

            if (item._tpl === defaultInventory)
            {
                inventoryId = item._id;
                continue;
            }

            if (!("parentId" in item))
            {
                continue;
            }

            if (!(item.parentId in itemsByParentHash))
            {
                itemsByParentHash[item.parentId] = [];
            }

            itemsByParentHash[item.parentId].push(item);
        }

        // update inventoryId
        const newInventoryId = this.hashUtil.generate();
        inventoryItemHash[inventoryId]._id = newInventoryId;
        profile.Inventory.equipment = newInventoryId;

        // update inventoryItem id
        if (inventoryId in itemsByParentHash)
        {
            for (const item of itemsByParentHash[inventoryId])
            {
                item.parentId = newInventoryId;
            }
        }

        return profile;
    }

    /**
     * Randomise a bots game version and account category
     * Chooses from all the game versions (standard, eod etc)
     * Chooses account type (default, Sherpa, etc)
     * @param botInfo bot info object to update
     */
    protected getRandomisedGameVersionAndCategory(botInfo: Info): void
    {
        const gameVersions = ["standard", "standard", "left_behind", "prepare_for_escape", "edge_of_darkness"];
        const accountTypes = [MemberCategory.DEFAULT,MemberCategory.DEFAULT,MemberCategory.DEFAULT,MemberCategory.DEFAULT,MemberCategory.DEFAULT,MemberCategory.DEFAULT,MemberCategory.DEFAULT,MemberCategory.DEFAULT,MemberCategory.DEFAULT,MemberCategory.DEFAULT,MemberCategory.DEFAULT,MemberCategory.DEVELOPER, MemberCategory.SHERPA,MemberCategory.SHERPA,MemberCategory.SHERPA,MemberCategory.EMISSARY, MemberCategory.EMISSARY, MemberCategory.EMISSARY]; // 0 = normal, 1 = dev, 256 = sherpa, 512 = emissary
        botInfo.GameVersion = this.randomUtil.getArrayValue(gameVersions);
        botInfo.AccountType = this.randomUtil.getArrayValue(accountTypes);
    }

    /**
     * Add a side-specific (usec/bear) dogtag item to a bots inventory
     * @param bot bot to add dogtag to
     * @returns Bot with dogtag added
     */
    protected generateDogtag(bot: IBotBase): IBotBase
    {
        const upd: Upd = {
            SpawnedInSession: true,
            Dogtag: {
                AccountId: bot.aid,
                ProfileId: bot._id,
                Nickname: bot.Info.Nickname,
                Side: bot.Info.Side,
                Level: bot.Info.Level,
                Time: (new Date().toISOString()),
                Status: "Killed by ",
                KillerAccountId: "Unknown",
                KillerProfileId: "Unknown",
                KillerName: "Unknown",
                WeaponName: "Unknown"
            }
        };

        const inventoryItem: Item = {
            _id: this.hashUtil.generate(),
            _tpl: ((bot.Info.Side === "Usec") ? BaseClasses.DOG_TAG_USEC : BaseClasses.DOG_TAG_BEAR),
            parentId: bot.Inventory.equipment,
            slotId: "Dogtag",
            location: undefined,
            upd: upd
        };

        bot.Inventory.items.push(inventoryItem);

        return bot;
    }
}