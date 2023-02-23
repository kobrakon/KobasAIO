import { inject, injectable } from "tsyringe";

import { ContainerHelper } from "../helpers/ContainerHelper";
import { ItemHelper } from "../helpers/ItemHelper";
import { PresetHelper } from "../helpers/PresetHelper";
import { RagfairServerHelper } from "../helpers/RagfairServerHelper";
import {
    ILooseLoot, Spawnpoint, SpawnpointsForced, SpawnpointTemplate
} from "../models/eft/common/ILooseLoot";
import { Item } from "../models/eft/common/tables/IItem";
import {
    IStaticAmmoDetails, IStaticContainerProps, IStaticForcedProps, IStaticLootDetails
} from "../models/eft/common/tables/ILootBase";
import { BaseClasses } from "../models/enums/BaseClasses";
import { ConfigTypes } from "../models/enums/ConfigTypes";
import { Money } from "../models/enums/Money";
import { ILocationConfig } from "../models/spt/config/ILocationConfig";
import { ILogger } from "../models/spt/utils/ILogger";
import { ConfigServer } from "../servers/ConfigServer";
import { LocalisationService } from "../services/LocalisationService";
import { SeasonalEventService } from "../services/SeasonalEventService";
import { JsonUtil } from "../utils/JsonUtil";
import { MathUtil } from "../utils/MathUtil";
import { ObjectId } from "../utils/ObjectId";
import { ProbabilityObject, ProbabilityObjectArray, RandomUtil } from "../utils/RandomUtil";

export interface IContainerItem
{
    items: Item[]
    width: number
    height: number
}

@injectable()
export class LocationGenerator
{
    protected locationConfig: ILocationConfig;

    constructor(
        @inject("WinstonLogger") protected logger: ILogger,
        @inject("JsonUtil") protected jsonUtil: JsonUtil,
        @inject("ObjectId") protected objectId: ObjectId,
        @inject("RandomUtil") protected randomUtil: RandomUtil,
        @inject("RagfairServerHelper") protected ragfairServerHelper: RagfairServerHelper,
        @inject("ItemHelper") protected itemHelper: ItemHelper,
        @inject("MathUtil") protected mathUtil: MathUtil,
        @inject("SeasonalEventService") protected seasonalEventService: SeasonalEventService,
        @inject("ContainerHelper") protected containerHelper: ContainerHelper,
        @inject("PresetHelper") protected presetHelper: PresetHelper,
        @inject("LocalisationService") protected localisationService: LocalisationService,
        @inject("ConfigServer") protected configServer: ConfigServer
    )
    {
        this.locationConfig = this.configServer.getConfig(ConfigTypes.LOCATION);
    }

    public generateContainerLoot(
        containerIn: IStaticContainerProps,
        staticForced: IStaticForcedProps[],
        staticLootDist: Record<string, IStaticLootDetails>,
        staticAmmoDist: Record<string, IStaticAmmoDetails[]>,
        locationName: string): IStaticContainerProps
    {
        const container = this.jsonUtil.clone(containerIn);
        const containerTypeId = container.Items[0]._tpl;
        const parentId = this.objectId.generate();
        container.Root = parentId;
        container.Items[0]._id = parentId;

        const containerTemplate = this.itemHelper.getItem(containerTypeId)[1];
        const height = containerTemplate._props.Grids[0]._props.cellsV;
        const width = containerTemplate._props.Grids[0]._props.cellsH;
        let container2D: number[][] = Array(height).fill(0).map(() => Array(width).fill(0));

        const itemCountArray = new ProbabilityObjectArray<number>(this.mathUtil);
        for (const icd of staticLootDist[containerTypeId].itemcountDistribution)
        {
            itemCountArray.push(
                new ProbabilityObject(icd.count, icd.relativeProbability)
            );
        }
        const numberItems = Math.round(this.getStaticLootMultiplerForLocation(locationName) * itemCountArray.draw()[0]);

        const seasonalEventActive = this.seasonalEventService.seasonalEventEnabled();
        const seasonalItemTplBlacklist = this.seasonalEventService.getSeasonalEventItemsToBlock();
        const itemDistribution = new ProbabilityObjectArray<string>(this.mathUtil);
        for (const icd of staticLootDist[containerTypeId].itemDistribution)
        {
            if (!seasonalEventActive && seasonalItemTplBlacklist.includes(icd.tpl))
            {
                // Skip seasonal event items if they're not enabled
                continue;
            }

            itemDistribution.push(
                new ProbabilityObject(icd.tpl, icd.relativeProbability)
            );
        }

        // Get forced container loot tpls
        const tplsForced = staticForced.filter(x => x.containerId === container.Id).map(x => x.itemTpl);

        // Draw random loot
        // money spawn more than once in container
        const locklist = [Money.ROUBLES, Money.DOLLARS, Money.EUROS];
        const tplsDraw = itemDistribution.draw(numberItems, false, locklist);
        const tpls = tplsForced.concat(tplsDraw);
        for (const tpl of tpls)
        {
            const created = this.createItem(tpl, staticAmmoDist, parentId);
            const items = created.items;
            const width = created.width;
            const height = created.height;

            const result = this.containerHelper.findSlotForItem(container2D, width, height);
            if (!result.success)
            {
                break;
            }

            container2D = this.containerHelper.fillContainerMapWithItem(container2D, result.x, result.y, width, height, result.rotation);
            const rot = result.rotation ? 1 : 0;

            items[0].slotId = "main";
            items[0].location = { "x": result.x, "y": result.y, "r": rot };


            for (const item of items)
            {
                container.Items.push(item);
            }
        }
        return container;
    }

    protected getLooseLootMultiplerForLocation(location: string): number
    {
        return this.locationConfig.looseLootMultiplier[location];
    }

    protected getStaticLootMultiplerForLocation(location: string): number
    {
        return this.locationConfig.staticLootMultiplier[location];
    }

    /**
     * Create array of loose + forced loot using probability system
     * @param dynamicLootDist 
     * @param staticAmmoDist 
     * @param locationName Location to generate loot for
     * @returns Array of spawn points with loot in them
     */
    public generateDynamicLoot(dynamicLootDist: ILooseLoot, staticAmmoDist: Record<string, IStaticAmmoDetails[]>, locationName: string): SpawnpointTemplate[]
    {
        const loot: SpawnpointTemplate[] = [];

        this.addForcedLoot(loot, this.jsonUtil.clone(dynamicLootDist.spawnpointsForced), locationName);

        const dynamicSpawnPoints = this.jsonUtil.clone(dynamicLootDist.spawnpoints);
        //draw from random distribution
        const numSpawnpoints = Math.round(
            this.getLooseLootMultiplerForLocation(locationName) *
            this.randomUtil.randn(
                dynamicLootDist.spawnpointCount.mean,
                dynamicLootDist.spawnpointCount.std
            )
        );

        const spawnpointArray = new ProbabilityObjectArray<string, Spawnpoint>(this.mathUtil);
        for (const si of dynamicSpawnPoints)
        {
            spawnpointArray.push(
                new ProbabilityObject(si.template.Id, si.probability, si)
            );
        }

        // Select a number of spawn points to add loot to
        let spawnPoints: Spawnpoint[] = [];
        for (const si of spawnpointArray.draw(numSpawnpoints, false))
        {
            spawnPoints.push(spawnpointArray.data(si));
        }

        // Filter out duplicate locationIds
        spawnPoints = [...new Map(spawnPoints.map(x => [x.locationId, x])).values()];
        const numberTooManyRequested = numSpawnpoints - spawnPoints.length;
        if (numberTooManyRequested > 0)
        {
            this.logger.info(this.localisationService.getText("location-spawn_point_count_requested_vs_found", {requested: numSpawnpoints, found: spawnPoints.length, mapName: locationName}));
        }

        // iterate over spawnpoints
        const seasonalEventActive = this.seasonalEventService.seasonalEventEnabled();
        const seasonalItemTplBlacklist = this.seasonalEventService.getSeasonalEventItemsToBlock();
        for (const spawnPoint of spawnPoints)
        {
            const itemArray = new ProbabilityObjectArray<string>(this.mathUtil);
            for (const itemDist of spawnPoint.itemDistribution)
            {
                if (!seasonalEventActive && seasonalItemTplBlacklist.includes(itemDist.tpl))
                {
                    // Skip seasonal event items if they're not enabled
                    continue;
                }

                itemArray.push(
                    new ProbabilityObject(itemDist.tpl, itemDist.relativeProbability)
                );
            }

            const tpl = itemArray.draw(1)[0];
            const itemToAdd = this.createItem(tpl, staticAmmoDist);
            const items = itemToAdd.items;

            const spawnpointTemplate = spawnPoint.template;
            spawnpointTemplate.Root = items[0]._id;

            for (const item of items)
            {
                spawnpointTemplate.Items.push(item);
            }

            loot.push(spawnpointTemplate);
        }

        return loot;
    }

    /**
     * Add forced spawn point loot into loot parameter array
     * @param loot array to add forced loot to
     * @param forcedSpawnPoints forced loot to add
     * @param name of map currently generating forced loot for
     */
    protected addForcedLoot(loot: SpawnpointTemplate[], forcedSpawnPoints: SpawnpointsForced[], locationName: string): void
    {
        const lootToForceSingleAmountOnMap = this.locationConfig.forcedLootSingleSpawnById[locationName];
        if (lootToForceSingleAmountOnMap)
        {
            // Process loot items defined as requiring only 1 spawn position as they appear in multiple positions on the map
            for (const itemTpl of lootToForceSingleAmountOnMap)
            {
                // Get all spawn positions for item tpl in forced loot array
                const items = forcedSpawnPoints.filter(x => x.template.Items[0]._tpl === itemTpl);
                if (!items || items.length === 0)
                {
                    this.logger.debug(`Unable to adjust loot item ${itemTpl} as it does not exist inside ${locationName} forced loot.`);
                    continue;
                }

                // Create probability array of all spawn positions for this spawn id
                const spawnpointArray = new ProbabilityObjectArray<string, SpawnpointsForced>(this.mathUtil);
                for (const si of items)
                {
                    // use locationId as template.Id is the same across all items
                    spawnpointArray.push(
                        new ProbabilityObject(si.locationId, si.probability, si)
                    );
                }
        
                // Choose 1 out of all found spawn positions for spawn id and add to loot array
                for (const spawnPointLocationId of spawnpointArray.draw(1, false))
                {
                    const itemToAdd = items.find(x => x.locationId === spawnPointLocationId);
                    const lootItem = itemToAdd.template;
                    lootItem.Root = this.objectId.generate();
                    lootItem.Items[0]._id = lootItem.Root;
                    loot.push(lootItem);
                }
            }
        }

        const seasonalEventActive = this.seasonalEventService.seasonalEventEnabled();
        const seasonalItemTplBlacklist = this.seasonalEventService.getSeasonalEventItemsToBlock();
        // Add remaining forced loot to array
        for (const forcedLootItem of forcedSpawnPoints)
        {
            // Skip spawn positions processed above
            if (lootToForceSingleAmountOnMap?.includes(forcedLootItem.template.Items[0]._tpl))
            {
                continue;
            }

            // Skip seasonal items when seasonal event is active
            if (!seasonalEventActive && seasonalItemTplBlacklist.includes(forcedLootItem.template.Items[0]._tpl))
            {
                continue;
            }

            const li = forcedLootItem.template;
            li.Root = this.objectId.generate();
            li.Items[0]._id = li.Root;
            loot.push(li);
        }
    }

    protected createItem(tpl: string, staticAmmoDist: Record<string, IStaticAmmoDetails[]>, parentId: string = undefined): IContainerItem
    {
        const itemTemplate = this.itemHelper.getItem(tpl)[1];

        let items: Item[] = [
            {
                _id: this.objectId.generate(),
                _tpl: tpl
            }
        ];

        // container item has container's id as parentId
        if (parentId)
        {
            items[0].parentId = parentId;
        }

        let width = itemTemplate._props.Width;
        let height = itemTemplate._props.Height;
        if (this.itemHelper.isOfBaseclass(tpl, BaseClasses.WEAPON))
        {
            let children: Item[] = [];
            const defaultPreset = this.jsonUtil.clone(this.presetHelper.getDefaultPreset(tpl));
            if (defaultPreset)
            {
                try
                {
                    children = this.ragfairServerHelper.reparentPresets(defaultPreset._items[0], defaultPreset._items);
                }
                catch (error)
                {
                    // this item already broke it once without being reproducible tpl = "5839a40f24597726f856b511"; AKS-74UB Default
                    // 5ea03f7400685063ec28bfa8 // ppsh default
                    // 5ba26383d4351e00334c93d9 //mp7_devgru
                    this.logger.warning(this.localisationService.getText("location-preset_not_found", {tpl: tpl, defaultId: defaultPreset._id, defaultName: defaultPreset._name, parentId: parentId}));

                    throw error;
                }
            }
            else
            {
                // RSP30 (62178be9d0050232da3485d9) doesnt have any default presets and kills this code below as it has no chidren to reparent
                this.logger.debug(`createItem() No preset found for weapon: ${tpl}`);
            }

            const rootItem = items[0];
            if (!rootItem)
            {
                this.logger.error(this.localisationService.getText("location-missing_root_item", {tpl: tpl, parentId: parentId}));

                throw new Error(this.localisationService.getText("location-critical_error_see_log"));
            }

            try
            {
                if (children?.length > 0)
                {
                    items = this.ragfairServerHelper.reparentPresets(rootItem, children);
                }                
            }
            catch (error)
            {
                this.logger.error(this.localisationService.getText("location-unable_to_reparent_item", {tpl: tpl, parentId: parentId}));

                throw error;
            }
            

            // Here we should use generalized BotGenerators functions e.g. fillExistingMagazines in the future since
            // it can handle revolver ammo (it's not restructured to be used here yet.)
            // General: Make a WeaponController for Ragfair preset stuff and the generating weapons and ammo stuff from
            // BotGenerator
            const mag = items.filter(x => x.slotId === "mod_magazine")[0];
            // some weapon presets come without magazine; only fill the mag if it exists
            if (mag)
            {
                const weapTemplate = this.itemHelper.getItem(rootItem._tpl)[1];
                // we can't use weaponTemplate's "_props.ammoCaliber" directly since there's a weapon ("weapon_zmz_pp-9_9x18pmm")
                // with non-existing ammoCaliber: Caliber9x18PMM -> We get the Caliber from the weapons' default ammo
                const defAmmoTemplate = this.itemHelper.getItem(weapTemplate._props.defAmmo)[1];
                const magTemplate = this.itemHelper.getItem(mag._tpl)[1];
                items.push(
                    this.itemHelper.createRandomMagCartridges(
                        magTemplate,
                        mag._id,
                        staticAmmoDist,
                        defAmmoTemplate._props.Caliber
                    )
                );
            }

            const size = this.itemHelper.getItemSize(items, rootItem._id);
            width = size.width;
            height = size.height;
        }

        if (this.itemHelper.isOfBaseclass(tpl, BaseClasses.MONEY) || this.itemHelper.isOfBaseclass(tpl, BaseClasses.AMMO))
        {
            const stackCount = this.randomUtil.getInt(itemTemplate._props.StackMinRandom, itemTemplate._props.StackMaxRandom);
            items[0].upd = { "StackObjectsCount": stackCount };
        }
        else if (this.itemHelper.isOfBaseclass(tpl, BaseClasses.AMMO_BOX))
        {
            const ammoBoxDetails = this.itemHelper.getItem(tpl);
            const ammoBoxMaxCartridgeCount = ammoBoxDetails[1]._props.StackSlots[0]._max_count;
            const cartridgeTpl = itemTemplate._props.StackSlots[0]._props.filters[0].Filter[0];
            const cartridgeDetails = this.itemHelper.getItem(cartridgeTpl);
            const cartridgeMaxStackSize = cartridgeDetails[1]._props.StackMaxSize;

            // Add new stack-size-correct items to ammo box
            let currentStoredCartridgeCount = 0;
            let location = 0;
            while (currentStoredCartridgeCount < ammoBoxMaxCartridgeCount)
            {
                // Get stack size of cartridges
                const cartridgeCountToAdd = (ammoBoxMaxCartridgeCount <= cartridgeMaxStackSize)
                    ? ammoBoxMaxCartridgeCount
                    : cartridgeMaxStackSize;

                // Add cartridge item object into items array
                items.push(this.itemHelper.createCartridges(items[0]._id, cartridgeTpl, cartridgeCountToAdd, location));

                currentStoredCartridgeCount += cartridgeCountToAdd;
                location ++;
            }
        }
        else if (this.itemHelper.isOfBaseclass(tpl, BaseClasses.MAGAZINE))
        {
            items.push(this.itemHelper.createRandomMagCartridges(itemTemplate, items[0]._id, staticAmmoDist));
        }

        return {
            items: items,
            width: width,
            height: height
        };
    }
}