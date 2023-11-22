import { DependencyContainer } from "tsyringe";
import { IPostDBLoadMod } from "@spt-aki/models/external/IPostDBLoadMod";
import { DatabaseServer } from "@spt-aki/servers/DatabaseServer";
import { ILogger } from "@spt-aki/models/spt/utils/ILogger";
import { ConfigServer } from "@spt-aki/servers/ConfigServer";
import { ConfigTypes } from "@spt-aki/models/enums/ConfigTypes";
import { IAirdropConfig } from "@spt-aki/models/spt/config/IAirdropConfig";
import { IInRaidConfig } from "@spt-aki/models/spt/config/IInRaidConfig";
import { IInventoryConfig } from "@spt-aki/models/spt/config/IInventoryConfig";
import { ILocationConfig } from "@spt-aki/models/spt/config/ILocationConfig";
import { IRagfairConfig } from "@spt-aki/models/spt/config/IRagfairConfig";
import { IItemConfig } from "@spt-aki/models/spt/config/IItemConfig";
import { IPmcConfig } from "@spt-aki/models/spt/config/IPmcConfig";

class aio implements IPostDBLoadMod
{
    public postDBLoad(container: DependencyContainer): void
    {   //look at this shit 
        const Logger = container.resolve<ILogger>("WinstonLogger");
        const config = require("../config.json");
        const database = container.resolve<DatabaseServer>("DatabaseServer").getTables();
        const globals = database.globals.config;
        const locations = database.locations;
        const items = database.templates.items;
        const suits = database.templates.customization;
        const traders = database.traders;
        const hideout = database.hideout;
        const configServer = container.resolve<ConfigServer>("ConfigServer") as ConfigServer;
        const InraidConfig = configServer.getConfig<IInRaidConfig>(ConfigTypes.IN_RAID);
        const LocationConfig = configServer.getConfig<ILocationConfig>(ConfigTypes.LOCATION);
        const RagfairConfig = configServer.getConfig<IRagfairConfig>(ConfigTypes.RAGFAIR);
        const AirdropConfig = configServer.getConfig<IAirdropConfig>(ConfigTypes.AIRDROP);
        const InventoryConfig = configServer.getConfig<IInventoryConfig>(ConfigTypes.INVENTORY);
        const PmcConfig = configServer.getConfig<IPmcConfig>(ConfigTypes.PMC);
        const ItemConfig = configServer.getConfig<IItemConfig>(ConfigTypes.ITEM);
    
        const randomMessageArray = ["that other AIO", "pornhub.com", "intentional lag machines", "your mother lmao", "an AR-15", "that one mod, you know the one", "the homework folder", "pictures of my cat (she's cute)"];
        const randomMessage = randomMessageArray[Math.floor(Math.random() * randomMessageArray.length)];
        Logger.info(`Loading: ${randomMessage}`);
    
        if (config.MasterFunction.Enabled) {
            Logger.log("Kobra is tweaking your SPT", "blue"); // LETS FUCKING GOOOOOOOO
    
            if (config.Traders.RagfairMinLevelChange.Enabled) { // If config value is true, run code
                globals.RagFair.minUserLevel = config.Traders.RagfairMinLevelChange.MinLevel; // get value of Ragfair minimum level and change it to value in config 
                Logger.info("[K-AIO] Changed Ragfair Level");
            }
    
            if (config.Raid.ReduceFoodAndHydroDegrade.Enabled) {
                globals.Health.Effects.Existence.EnergyDamage = config.Raid.ReduceFoodAndHydroDegrade.EnergyDecay; // Get value of EnergyDamage and change it to value in config
                globals.Health.Effects.Existence.HydrationDamage = config.Raid.ReduceFoodAndHydroDegrade.HydroDecay;
                Logger.info("[K-AIO] Reduced Food and Hydro Degregation");
            }
    
            for (const id in items) 
            { // For all IDs with target value in ID, apply changes
                if (config.Items.AllItemsExamined.Enabled) 
                    items[id]._props["ExaminedByDefault"] = true; 
                
                if (config.Items.DisableSecuredContRestrictions.Enabled && items[id]._parent == ("5448bf274bdc2dfc2f8b456a") && items[id]._props.Grids[0]._props.filters !== undefined) 
                    items[id]._props.Grids[0]._props.filters = [];
                
                if (config.Meds.EditStimulantUseAmount.Enabled && items[id]._parent == ("5448f3a64bdc2d60728b456a") || items[id]._id == "544fb3f34bdc2d03748b456a" && config.Meds.EditStimulantUseAmount.Enabled) 
                    items[id]._props.MaxHpResource = config.Meds.EditStimulantUseAmount.StimulantUseAmount;
                
                if (config.Items.AllArmorsProtectStomach.Enabled && items[id]._parent == "5448e5284bdc2dcb718b4567" || config.Items.AllArmorsProtectStomach.Enabled && items[id]._parent == "5448e54d4bdc2dcc718b4568" && !items[id]._props.armorZone.includes("Stomach")) 
                    items[id]._props.armorZone.push("Stomach");
                
                if (config.Items.HighCapMagsOnly2SlotsTall.Enabled && items[id]._parent == ("5448bc234bdc2d3c308b4569") && items[id]._props.Height > 2) 
                    items[id]._props.Height = 2;
                
                if (config.Items.AllowArmoredRigsWithBodyArmor.Enabled && items[id]._parent == "5448e5284bdc2dcb718b4567")
                    items[id]._props.BlocksArmorVest = false;
                
                if (config.Items.RealisticRecoil.Enabled)
                {
                    if (items[id]._props.weapClass != null && items[id]._props.weapClass !== undefined)
                    {
                        if (items[id]._props.weapClass !== "pistol") 
                        {
                            items[id]._props.CameraRecoil *= 0.25;
                            items[id]._props.CameraSnap = 3.5;
                        }
                        else 
                        {
                            items[id]._props.CameraRecoil *= 0.45;
                            items[id]._props.CameraSnap = 3.5;
                        }
                    }
                }
                if (config.Items.AmmoStackMultiplier.Enabled)
                {
                    if (items[id]._parent.includes("5485a8684bdc2da71d8b4567"))
                        items[id]._props.StackMaxSize *= config.Items.AmmoStackMultiplier.Multi;
                }

                if (config.Items.NoKeyDurability.Enabled) 
                {
                    if (items[id]._parent == "543be5e94bdc2df1348b4568" || "5c99f98d86f7745c314214b3" || "5c164d2286f774194c5e69fa") // yeah so I once fucked this line up because I didn't add 2 equals and it overloaded the ItemHelper. fucking syntax
                        items[id]._props.MaximumNumberOfUsage = 0;// 0 = infinite btw
                }

                if (config.Traders.DisableBSGBlacklist.Enabled) 
                {
                    if (items[id]._type === "Item" && !items[id]._props.CanSellOnRagfair)
                        items[id]._props.CanSellOnRagfair = true;
                }

                if (config.Items.DisableRMTRestrictions.Enabled)
                    items[id]._props.DiscardLimit = -1;
            }
    
            // gotta put these outside of the for loop or else the console will be REAAAALY fuckin annoying
            if (config.Items.RealisticRecoil.Enabled)
            {
                globals.Aiming.RecoilCrank = true;
                globals.Aiming.AimProceduralIntensity = 0.7;
                globals.Aiming.RecoilHandDamping = 0.6;
                globals.Aiming.RecoilDamping = 0.5;
                globals.Aiming.RecoilConvergenceMult *= 4;
                globals.Aiming.RecoilVertBonus = 30;
                globals.Aiming.RecoilBackBonus = 80;
                Logger.info("[K-AIO] Tweaking recoil to be more realistic");
            }

            if (config.Items.HighCapMagsOnly2SlotsTall.Enabled) 
                Logger.info("[K-AIO] Shortened high capacity magazines to just 2 slots tall");
    
            if (config.Items.DisableSecuredContRestrictions.Enabled)
                Logger.info("[K-AIO] Removed Secured Container restrictions");

            if (config.Items.AllowArmoredRigsWithBodyArmor.Enabled)
                Logger.info("[K-AIO] You can now wear rigs with body armor");

            if (config.Bots.PMCFriendlyToSameFaction.Enabled) {
                PmcConfig.chanceSameSideIsHostilePercent = 0; // Make all same-side PMCs friendly by making random chance of being hostile to same faction equal 0
                Logger.info("[K-AIO] All PMCs are now friendly to faction members");
            }

            if (config.Raid.ChangeAirdropValues.Enabled){
                AirdropConfig.airdropChancePercent.bigmap = config.Raid.ChangeAirdropValues.Customs;
                AirdropConfig.airdropChancePercent.woods = config.Raid.ChangeAirdropValues.Woods;
                AirdropConfig.airdropChancePercent.lighthouse = config.Raid.ChangeAirdropValues.Lighthouse;
                AirdropConfig.airdropChancePercent.shoreline = config.Raid.ChangeAirdropValues.Interchange;
                AirdropConfig.airdropChancePercent.interchange = config.Raid.ChangeAirdropValues.Shoreline;
                AirdropConfig.airdropChancePercent.reserve = config.Raid.ChangeAirdropValues.Reserve;
                AirdropConfig.planeVolume = config.Raid.ChangeAirdropValues.PlaneVolume; //bbbrrrrrrrrrrrrrRRRRRRRRRRRRRRR
                AirdropConfig.airdropMinStartTimeSeconds = config.Raid.ChangeAirdropValues.MinStartTimeSeconds;
                AirdropConfig.airdropMaxStartTimeSeconds = config.Raid.ChangeAirdropValues.MaxStartTimeSeconds;
                Logger.info(`[K-AIO] Changed Airdrop values`);
            }
    
            if (config.Raid.CustomRaidTime.Enabled) 
            {
                for (let map in locations) 
                {
                    if (map !== "base") 
                    {
                        locations[map].base.exit_access_time = config.Raid.CustomRaidTime.TimeInMinutes; // Change raid times to that in the config
                        locations[map].base.EscapeTimeLimit = config.Raid.CustomRaidTime.TimeInMinutes; // Ditto
                    }
                }
                Logger.info("[K-AIO] Extended Raid Time");
            }
    
            if (config.Items.AllArmorsProtectStomach.Enabled) // wait this seems a little familiar
                Logger.info("[K-AIO] All armors should protect the stomach now");
    
            if (config.Items.AmmoStackMultiplier.Enabled)
                Logger.info(`[K-AIO] Multiplied max ammo stack by ${config.Items.AmmoStackMultiplier.Multi}`);
    
            if (config.Meds.EditStimulantUseAmount.Enabled)
                Logger.info(`[K-AIO] Stimulants now have ${config.Meds.EditStimulantUseAmount.StimulantUseAmount} uses`);
    
            if (config.Items.BoughtItemsFIR.Enabled) { // literally just makes everything you buy FIR
                InventoryConfig.newItemsMarkedFound = true;
                Logger.info("[K-AIO] All items bought by traders and flea market will be marked FIR");
            }
    
            if (config.Items.NoArmorRepairDecay.Enabled) { // Makes it so that items don't lose max durability when repaired
                for (let materials in globals.ArmorMaterials) 
                {
                    globals.ArmorMaterials[materials].MinRepairDegradation = 0;
                    globals.ArmorMaterials[materials].MaxRepairDegradation = 0;
                }
                Logger.info("[K-AIO] Repairs no longer decay max armor durability");
            }
    
            if (config.Items.NoKeyDurability.Enabled)
                Logger.info("[K-AIO] Keys are back to having infinite uses");
    
            if (config.Meds.EditMedHealth.Enabled) {
                items["590c678286f77426c9660122"]._props.MaxHpResource = config.Meds.EditMedHealth.IFAK; // Get MaxHpResource of item ID and change its value to config value
                items["60098ad7c2240c0fe85c570a"]._props.MaxHpResource = config.Meds.EditMedHealth.AFAK;
                items["544fb45d4bdc2dee738b4568"]._props.MaxHpResource = config.Meds.EditMedHealth.Salewa;
                items["590c657e86f77412b013051d"]._props.MaxHpResource = config.Meds.EditMedHealth.Grizzly; // is this really necessary
                items["590c661e86f7741e566b646a"]._props.MaxHpResource = config.Meds.EditMedHealth.Car;
                items["5755356824597772cb798962"]._props.MaxHpResource = config.Meds.EditMedHealth.AI2; // cheese
                items["5d02778e86f774203e7dedbe"]._props.MaxHpResource = config.Meds.EditMedHealth.CMS;
                items["5d02797c86f774203f38e30a"]._props.MaxHpResource = config.Meds.EditMedHealth.Surv12;
                items["5e8488fa988a8701445df1e4"]._props.MaxHpResource = config.Meds.EditMedHealth.CALOKB;
                items["5e831507ea0a7c419c2f9bd9"]._props.MaxHpResource = config.Meds.EditMedHealth.Esmarch;
                items["60098af40accd37ef2175f27"]._props.MaxHpResource = config.Meds.EditMedHealth.CAT;
                items["544fb3364bdc2d34748b456a"]._props.MaxHpResource = config.Meds.EditMedHealth.Splint;
                items["5af0454c86f7746bf20992e8"]._props.MaxHpResource = config.Meds.EditMedHealth.AluminumSplint;
                items["5af0548586f7743a532b7e99"]._props.MaxHpResource = config.Meds.EditMedHealth.Ibuprofen;
                items["544fb37f4bdc2dee738b4567"]._props.MaxHpResource = config.Meds.EditMedHealth.Analgin;
                items["590c695186f7741e566b64a2"]._props.MaxHpResource = config.Meds.EditMedHealth.Augmentin;
                items["5755383e24597772cb798966"]._props.MaxHpResource = config.Meds.EditMedHealth.Vaseline;
                items["5751a89d24597722aa0e8db0"]._props.MaxHpResource = config.Meds.EditMedHealth.GoldenStar;
                items["544fb25a4bdc2dfb738b4567"]._props.MaxHpResource = config.Meds.EditMedHealth.Bandage;
                items["5751a25924597722c463c472"]._props.MaxHpResource = config.Meds.EditMedHealth.ArmyBandage;
                Logger.info("[K-AIO] Medkit health values changed");
            }
    
            if (config.Traders.DisableBSGBlacklist.Enabled)
                Logger.info("[K-AIO] Disabled BSG Blacklist");
    
            if (config.Items.ChangeLootSpawnMultipliers.Enabled) 
            { // ok it works thanks chomp very cool
                for (let map in LocationConfig.looseLootMultiplier)
                    LocationConfig.looseLootMultiplier[map] = config.Items.ChangeLootSpawnMultipliers.LooseLootMulti

                for (let map in LocationConfig.staticLootMultiplier)
                    LocationConfig.staticLootMultiplier[map] = config.Items.ChangeLootSpawnMultipliers.StaticLootMulti
                
                Logger.info("[K-AIO] Changed loot multipliers")
            }
    
            if (config.Raid.SetPreRaidSettings.Enabled) 
            { // y'know that little offline raid menu where you can set AI shit? yeah that's what this is talking about
                InraidConfig.raidMenuSettings.aiAmount = config.Raid.SetPreRaidSettings.AIAmount
                InraidConfig.raidMenuSettings.aiDifficulty = config.Raid.SetPreRaidSettings.AIDifficulty
                InraidConfig.raidMenuSettings.bossEnabled = config.Raid.SetPreRaidSettings.EnableBosses
                InraidConfig.raidMenuSettings.scavWars = config.Raid.SetPreRaidSettings.ScavWar
                InraidConfig.raidMenuSettings.taggedAndCursed = config.Raid.SetPreRaidSettings.TaggedAndCursed
                Logger.info("[K-AIO] Set Pre-Raid settings")
            }
    
            if (config.Traders.RagfairDurability.Enabled) 
            { // Sets the minumum and maximum possible durability of items sold on flea
                Object.values(RagfairConfig.dynamic.condition).forEach(entry => 
                {
                    entry.min = config.Traders.RagfairDurability.Minimum;
                    entry.max = config.Traders.RagfairDurability.Maximum;
                    entry.conditionChance = config.Traders.RagfairDurability.ConditionChance;
                });

                Logger.info("[K-AIO] Set Flea Market durability range");
            }

            if (config.Items.HelmetProtectsFullHead.Enabled)
            {
                Object.values(items).filter((item: any) => item._props.headSegments).map((item: any) => {item._props.headSegments = ["Top", "Nape", "Ears", "Eyes", "Jaws"]}); // gotta do this jank shit in order for it to work, yup, lambda expressions cause fuck you
                Logger.info("[K-AIO] Helmets should protect ALL of the head");
            }
    
            if (config.Traders.AllClothesFree.Enabled) {
                for (let trader in traders) 
                { // get the fucker
                    if (traders[trader].suits) 
                    { // ayy he got drip???
                        for (let file in traders[trader].suits) 
                        { // fr
                            let fileData = traders[trader].suits[file]
                            fileData.requirements.loyaltyLevel = 1;
                            fileData.requirements.profileLevel = 1;
                            fileData.requirements.standing = 0;
                            fileData.requirements.skillRequirements = [];
                            fileData.requirements.questRequirements = [];
                            fileData.requirements.itemRequirements = [];
                        }
                    }
                }
                Logger.info("[K-AIO] All clothes are free");
            }
    
            if (config.Traders.ClothesForBothSides.Enabled) 
            { // usec? more like ukek lmao
                for (let suit in suits) 
                {
                    let suitData = suits[suit];
                    suitData._props.Side = ["Savage", "Bear", "Usec"];
                }
                Logger.info("[K-AIO] All clothes are available for both sides")
            }
    
            if (config.Traders.Insurance.Enabled) 
            { // god if only I could do this irl
                traders["54cb50c76803fa8b248b4571"].base.insurance.min_return_hour = config.Traders.Insurance.PraporMinReturnHour;
                traders["54cb50c76803fa8b248b4571"].base.insurance.max_return_hour = config.Traders.Insurance.PraporMaxReturnHour;
                traders["54cb57776803fa99248b456e"].base.insurance.min_return_hour = config.Traders.Insurance.TherapistMinReturnHour;
                traders["54cb57776803fa99248b456e"].base.insurance.max_return_hour = config.Traders.Insurance.TherapistMaxReturnHour;
                Logger.info("[K-AIO] Tweaked insurance")
            }
    
            if (config.Raid.NoPlayerScavTimer.Enabled) 
            { // just makes is so you can use scav whenever you want
                globals.SavagePlayCooldown = 1;
                Logger.info("[K-AIO] Scav timer disabled");
            }
          
            if (config.Hideout.ChangeConstructionTime.Enabled) 
            { // Changes hideout construction time to that in the config
                for (const areas in hideout.areas) 
                {
                    let area = hideout.areas[areas]
                    for (const subSet in area.stages)
                    {
                        if (area.stages[subSet].constructionTime > 0) 
                        {
                            area.stages[subSet].constructionTime = config.Hideout.ChangeConstructionTime.ConstructionTime;
                        }
                        let ass = area.stages[subSet].requirements
                        for (const shit in ass) // ah fuck here we go again
                        {
                            if (config.Hideout.NoLoyaltyLevelForConstruction.Enabled) 
                                ass[shit].loyaltyLevel = 1;
                        }
                    } 
                }
                Logger.info(`[K-AIO] Hideout construction time changed to ${config.Hideout.ChangeConstructionTime.ConstructionTime} seconds`)
            }
    
            if (config.Hideout.ChangeProductionTime.Enabled)
            {
                for (const product in hideout.production)
                {
                    if (hideout.production[product].endProduct !== "59faff1d86f7746c51718c9c")
                    { // I don't think I need to explain why I added this check
                        hideout.production[product].productionTime = config.Hideout.ChangeProductionTime.ProductionTime;
                    }
                }
                Logger.info(`[K-AIO] Hideout production time changed to ${config.Hideout.ChangeProductionTime.ProductionTime} seconds`);
            }
    
            if (config.Hideout.NoLoyaltyLevelForConstruction.Enabled)
            {
                Logger.info("[K-AIO] Hideout upgrades no longer need higher loyalty levels");
            }
    
            if (config.Traders.InstantSellOffers.Enabled)
            {
                RagfairConfig.sell.chance.base = 100;
                RagfairConfig.sell.time.min = 0;
                RagfairConfig.sell.time.max = 0;
                Logger.info("[K-AIO] All things sold on the flea market will be insta-bought");
            }
    
            if (config.Traders.NoFleaSellFees.Enabled)
            {
                RagfairConfig.sell.fees = false;
                Logger.info("[K-AIO] Flea market will no longer charge fees for selling");
            }

            if (config.Items.DisableRMTRestrictions)
            {
                globals.RestrictionsInRaid = [];
                Logger.info("[K-AIO] All RMT restrictions wiped");
            }
        } else {
            Logger.log("K-AIO is disabled. No changes were made", "red"); // I see how it is
        }
    }
}

module.exports = { mod: new aio() }
