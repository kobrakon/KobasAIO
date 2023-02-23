import { inject, injectable } from "tsyringe";

import { ItemHelper } from "../helpers/ItemHelper";
import { ConfigTypes } from "../models/enums/ConfigTypes";
import { IBotConfig } from "../models/spt/config/IBotConfig";
import { ConfigServer } from "../servers/ConfigServer";
import { DatabaseServer } from "../servers/DatabaseServer";
import { ItemFilterService } from "../services/ItemFilterService";
import { SeasonalEventService } from "../services/SeasonalEventService";

/**
 * Handle the generation of dynamic PMC loot in pockets and backpacks 
 * and the removal of blacklisted items
 */
@injectable()

export class PMCLootGenerator
{
    protected pocketLootPool: string[] = [];
    protected backpackLootPool: string[] = [];
    protected botConfig: IBotConfig;

    constructor(
        @inject("ItemHelper") protected itemHelper: ItemHelper,
        @inject("DatabaseServer") protected databaseServer: DatabaseServer,
        @inject("ConfigServer") protected configServer: ConfigServer,
        @inject("ItemFilterService") protected itemFilterService: ItemFilterService,
        @inject("SeasonalEventService") protected seasonalEventService: SeasonalEventService
    )
    {
        this.botConfig = this.configServer.getConfig(ConfigTypes.BOT);
    }

    /**
     * Create an array of loot items a PMC can have in their pockets
     * @returns string array of tpls
     */
    public generatePMCPocketLootPool(): string[]
    {
        const items = this.databaseServer.getTables().templates.items;

        const allowedItemTypes = this.botConfig.pmc.dynamicLoot.whitelist;
        const pmcItemBlacklist = this.botConfig.pmc.dynamicLoot.blacklist;
        const itemBlacklist = this.itemFilterService.getBlacklistedItems();

        // Blacklist seasonal items if not inside seasonal event
        if (!this.seasonalEventService.seasonalEventEnabled())
        {
            // Blacklist seasonal items
            itemBlacklist.push(...this.seasonalEventService.getSeasonalEventItemsToBlock());
        }

        // Hydrate loot dictionary if empty
        if (Object.keys(this.pocketLootPool).length === 0)
        {
            const itemsToAdd = Object.values(items).filter(item => allowedItemTypes.includes(item._parent)
                                                            && this.itemHelper.isValidItem(item._id)
                                                            && !pmcItemBlacklist.includes(item._id)
                                                            && !itemBlacklist.includes(item._id)
                                                            && item._props.Width === 1
                                                            && item._props.Height === 1);

            this.pocketLootPool = itemsToAdd.map(x => x._id);
        }

        return this.pocketLootPool;
    }

    /**
     * Create an array of loot items a PMC can have in their backpack
     * @returns string array of tpls
     */
    public generatePMCBackpackLootPool(): string[]
    {
        const items = this.databaseServer.getTables().templates.items;

        const allowedItemTypes = this.botConfig.pmc.dynamicLoot.whitelist;
        const pmcItemBlacklist = this.botConfig.pmc.dynamicLoot.blacklist;
        const itemBlacklist = this.itemFilterService.getBlacklistedItems();

        // blacklist event items if not inside seasonal event
        if (!this.seasonalEventService.seasonalEventEnabled())
        {
            // Blacklist seasonal items
            itemBlacklist.push(...this.seasonalEventService.getSeasonalEventItemsToBlock());
        }

        // Hydrate loot dictionary if empty
        if (Object.keys(this.backpackLootPool).length === 0)
        {
            const itemsToAdd = Object.values(items).filter(item => allowedItemTypes.includes(item._parent)
                                                            && this.itemHelper.isValidItem(item._id)
                                                            && !pmcItemBlacklist.includes(item._id)
                                                            && !itemBlacklist.includes(item._id));

            this.backpackLootPool = itemsToAdd.map(x => x._id);
        }

        return this.backpackLootPool;
    }
}