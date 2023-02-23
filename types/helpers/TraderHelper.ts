import { inject, injectable } from "tsyringe";

import { FenceLevel } from "../models/eft/common/IGlobals";
import { IPmcData } from "../models/eft/common/IPmcData";
import { Item } from "../models/eft/common/tables/IItem";
import { ProfileTraderTemplate } from "../models/eft/common/tables/IProfileTemplate";
import {
    IBarterScheme, ITraderAssort, ITraderBase, LoyaltyLevel
} from "../models/eft/common/tables/ITrader";
import { ConfigTypes } from "../models/enums/ConfigTypes";
import { Money } from "../models/enums/Money";
import { Traders } from "../models/enums/Traders";
import { ITraderConfig } from "../models/spt/config/ITraderConfig";
import { ILogger } from "../models/spt/utils/ILogger";
import { ConfigServer } from "../servers/ConfigServer";
import { DatabaseServer } from "../servers/DatabaseServer";
import { SaveServer } from "../servers/SaveServer";
import { FenceService } from "../services/FenceService";
import { LocalisationService } from "../services/LocalisationService";
import { PlayerService } from "../services/PlayerService";
import { TimeUtil } from "../utils/TimeUtil";
import { HandbookHelper } from "./HandbookHelper";
import { ItemHelper } from "./ItemHelper";
import { PaymentHelper } from "./PaymentHelper";
import { ProfileHelper } from "./ProfileHelper";

@injectable()
export class TraderHelper
{
    protected traderConfig: ITraderConfig;
    /** Dictionary of item tpl and the highest trader rouble price */
    protected highestTraderPriceItems: Record<string, number> = null;

    constructor(
        @inject("WinstonLogger") protected logger: ILogger,
        @inject("DatabaseServer") protected databaseServer: DatabaseServer,
        @inject("SaveServer") protected saveServer: SaveServer,
        @inject("ProfileHelper") protected profileHelper: ProfileHelper,
        @inject("PaymentHelper") protected paymentHelper: PaymentHelper,
        @inject("ItemHelper") protected itemHelper: ItemHelper,
        @inject("HandbookHelper") protected handbookHelper: HandbookHelper,
        @inject("PlayerService") protected playerService: PlayerService,
        @inject("LocalisationService") protected localisationService: LocalisationService,
        @inject("FenceService") protected fenceService: FenceService,
        @inject("TimeUtil") protected timeUtil: TimeUtil,
        @inject("ConfigServer") protected configServer: ConfigServer
    )
    {
        this.traderConfig = this.configServer.getConfig(ConfigTypes.TRADER);
    }

    public getTrader(traderID: string, sessionID: string): ITraderBase
    {
        const pmcData = this.profileHelper.getPmcProfile(sessionID);
        const trader = this.databaseServer.getTables().traders[traderID].base;

        if (!("TradersInfo" in pmcData))
        {
            // pmc profile wiped
            return trader;
        }

        if (!(traderID in pmcData.TradersInfo))
        {
            // trader doesn't exist in profile
            this.resetTrader(sessionID, traderID);
            this.lvlUp(traderID, sessionID);
        }

        return trader;
    }

    public getTraderAssortsById(traderId: string): ITraderAssort
    {
        return traderId === Traders.FENCE
            ? this.fenceService.getRawFenceAssorts()
            : this.databaseServer.getTables().traders[traderId].assort;
    }

    /**
     * Reset a profiles trader data back to its initial state as seen by a level 1 player
     * Does NOT take into account different profile levels
     * @param sessionID session id
     * @param traderID trader id to reset
     */
    public resetTrader(sessionID: string, traderID: string): void
    {
        const account = this.saveServer.getProfile(sessionID);
        const pmcData = this.profileHelper.getPmcProfile(sessionID);
        const rawProfileTemplate: ProfileTraderTemplate = this.databaseServer.getTables().templates.profiles[account.info.edition][pmcData.Info.Side.toLowerCase()].trader;

        pmcData.TradersInfo[traderID] = {
            disabled: false,
            loyaltyLevel: rawProfileTemplate.initialLoyaltyLevel,
            salesSum: rawProfileTemplate.initialSalesSum,
            standing: rawProfileTemplate.initialStanding,
            nextResupply: this.databaseServer.getTables().traders[traderID].base.nextResupply,
            unlocked: this.databaseServer.getTables().traders[traderID].base.unlockedByDefault
        };

        if (traderID === Traders.JAEGER)
        {
            pmcData.TradersInfo[traderID].unlocked = rawProfileTemplate.jaegerUnlocked;
        }
    }

    /**
     * Alter a traders unlocked status
     * @param traderId Trader to alter
     * @param status New status to use
     * @param sessionId Session id
     */
    public setTraderUnlockedState(traderId: string, status: boolean, sessionId: string): void
    {
        const pmcData = this.profileHelper.getPmcProfile(sessionId);
        pmcData.TradersInfo[traderId].unlocked = status;
    }

    /**
     * Get a list of items and their prices from player inventory that can be sold to a trader
     * @param traderID trader id being traded with
     * @param sessionID session id
     * @returns IBarterScheme[][]
     */
    public getPurchasesData(traderID: string, sessionID: string): Record<string, IBarterScheme[][]>
    {
        const pmcData = this.profileHelper.getPmcProfile(sessionID);
        const traderBase = this.databaseServer.getTables().traders[traderID].base;
        const buyPriceCoefficient = this.getLoyaltyLevel(traderBase._id, pmcData).buy_price_coef;
        const fenceLevel = this.fenceService.getFenceInfo(pmcData);
        const currencyTpl = this.paymentHelper.getCurrency(traderBase.currency);
        const output: Record<string, IBarterScheme[][]> = {};

        // Iterate over player inventory items
        for (const item of pmcData.Inventory.items)
        {
            if (this.isItemUnSellableToTrader(pmcData, item, traderBase.sell_category, traderID))
            {
                // Skip item if trader can't buy
                continue;
            }

            const itemPriceTotal = this.getAdjustedItemPrice(pmcData, item, buyPriceCoefficient, fenceLevel, traderBase, currencyTpl);
            const barterDetails: IBarterScheme = {
                count: parseInt(itemPriceTotal.toFixed(0)),
                _tpl: currencyTpl
            };
            output[item._id] = [[barterDetails]];
        }

        return output;
    }

    /**
     * Should item be skipped when selling to trader according to its sell categories and other checks
     * @param pmcData Profile
     * @param item Item to be checked is sellable to trader
     * @param sellCategory categories trader will buy
     * @param traderId Trader item is being checked can be sold to
     * @returns true if should NOT be sold to trader
     */
    protected isItemUnSellableToTrader(pmcData: IPmcData, item: Item, sellCategory: string[], traderId: string): boolean
    {
        return item._id === pmcData.Inventory.equipment
        || item._id === pmcData.Inventory.stash
        || item._id === pmcData.Inventory.questRaidItems
        || item._id === pmcData.Inventory.questStashItems
        || this.itemHelper.isNotSellable(item._tpl)
        || this.itemIsBelowSellableDurabilityThreshhold(item, traderId)
        || this.doesTraderBuyItem(sellCategory, item._tpl) === false;
    }

    /**
     * Check if item has durability so low it precludes it from being sold to the trader (inclusive)
     * @param item Item to check durability of
     * @param traderId Trader item is sold to
     * @returns 
     */
    protected itemIsBelowSellableDurabilityThreshhold(item: Item, traderId: string): boolean
    {
        // Item has no durability
        if (!item.upd?.Repairable)
        {
            return false;
        }

        // Can't sell item to trader below x% durability (varies per trader)
        const itemDetails = this.itemHelper.getItem(item._tpl);
        const currentDurabilityAsPercentOfMax = Math.round((item.upd.Repairable.Durability / itemDetails[1]._props.MaxDurability) * 100);
        const traderDurabilityThresholdPercent = this.getTraderDurabiltyPurchaseThreshold(traderId);

        if (currentDurabilityAsPercentOfMax < traderDurabilityThresholdPercent)
        {
            return true;
        }

        return false;
    }

    /**
     * Get the percentage threshold value a trader will buy armor/weapons above
     * @param traderId Trader to look up
     * @returns percentage
     */
    protected getTraderDurabiltyPurchaseThreshold(traderId: string): number
    {
        let value = this.traderConfig.durabilityPurchaseThreshhold[traderId];
        if (typeof value === "undefined")
        {
            value = this.traderConfig.durabilityPurchaseThreshhold["default"];
            this.logger.warning(this.localisationService.getText("trader-missing_durability_threshold_value", {traderId: traderId, value: value}));
        }

        return value;
    }

    /**
     * Get the price of passed in item and all of its attached children (mods)
     * Take into account bonuses/adjustments e.g. discounts
     * @param pmcData profile data
     * @param item item to calculate price of
     * @param buyPriceCoefficient 
     * @param fenceInfo fence data
     * @param traderBase trader details
     * @param currencyTpl Currency to get price as
     * @returns price of item + children
     */
    protected getAdjustedItemPrice(pmcData: IPmcData, item: Item, buyPriceCoefficient: number, fenceInfo: FenceLevel, traderBase: ITraderBase, currencyTpl: string): number
    {
        // Get total sum of item + mods (e.g. weapon preset)
        let price = this.getRawItemPrice(pmcData, item);

        // Dogtags - adjust price based on level
        if ("upd" in item && "Dogtag" in item.upd && this.itemHelper.isDogtag(item._tpl))
        {
            price *= item.upd.Dogtag.Level;
        }

        // Adjust price based on current quality (e.g. meds & repairables)
        price *= this.itemHelper.getItemQualityModifier(item);

        // Trader reputation modification (e.g. fence scav karma)
        const discount = this.getTraderDiscount(traderBase, buyPriceCoefficient, fenceInfo);
        if (discount > 0)
        {
            price -= (discount / 100) * price;
        }

        // Adjust price to desired currency
        price = this.handbookHelper.fromRUB(price, currencyTpl);

        // Force price to be at minimum 1
        price = (price > 0)
            ? price
            : 1;

        return price;
    }

    /**
     * Get the raw price of item+child items from handbook without any modification
     * @param pmcData profile data
     * @param item item to calculate price of
     * @returns price as number
     */
    protected getRawItemPrice(pmcData: IPmcData, item: Item): number
    {
        let price = 0;
        for (const childItem of this.itemHelper.findAndReturnChildrenAsItems(pmcData.Inventory.items, item._id))
        {
            const handbookPrice = this.handbookHelper.getTemplatePrice(childItem._tpl);
            const count = ("upd" in childItem && "StackObjectsCount" in childItem.upd)
                ? childItem.upd.StackObjectsCount 
                : 1;

            price += (handbookPrice * count);
        }

        return price;
    }

    /**
     * Get discount modifier for desired trader
     * @param trader Trader to get discount for
     * @param buyPriceCoefficient 
     * @param fenceInfo fence info, needed if getting fence modifier value
     * @returns discount modifier value
     */
    protected getTraderDiscount(trader: ITraderBase, buyPriceCoefficient: number, fenceInfo: FenceLevel): number
    {
        let discount = trader.discount + buyPriceCoefficient;
        if (trader._id === Traders.FENCE)
        {
            discount *= fenceInfo.PriceModifier;
        }

        return discount;
    }

    /**
     * Add standing to a trader and level them up if exp goes over level threshold
     * @param sessionId Session id
     * @param traderId Traders id
     * @param standingToAdd Standing value to add to trader
     */
    public addStandingToTrader(sessionId: string, traderId: string, standingToAdd: number): void
    {
        const pmcData = this.profileHelper.getPmcProfile(sessionId);
        const traderInfo = pmcData.TradersInfo[traderId];

        // Add standing to trader
        traderInfo.standing += standingToAdd;

        // dont allow standing to fall below 0
        if (traderInfo.standing < 0)
        {
            traderInfo.standing = 0;
        }

        this.lvlUp(traderId, sessionId);
    }

    /**
     * Calculate traders level based on exp amount and increments level if over threshold
     * @param traderID trader to process
     * @param sessionID session id
     */
    public lvlUp(traderID: string, sessionID: string): void
    {
        const loyaltyLevels = this.databaseServer.getTables().traders[traderID].base.loyaltyLevels;
        const pmcData = this.profileHelper.getPmcProfile(sessionID);

        // level up player
        pmcData.Info.Level = this.playerService.calculateLevel(pmcData);

        // level up traders
        let targetLevel = 0;

        // round standing to 2 decimal places to address floating point inaccuracies
        pmcData.TradersInfo[traderID].standing = Math.round(pmcData.TradersInfo[traderID].standing * 100) / 100;

        for (const level in loyaltyLevels)
        {
            const loyalty = loyaltyLevels[level];

            if ((loyalty.minLevel <= pmcData.Info.Level
                && loyalty.minSalesSum <= pmcData.TradersInfo[traderID].salesSum
                && loyalty.minStanding <= pmcData.TradersInfo[traderID].standing)
                && targetLevel < 4)
            {
                // level reached
                targetLevel++;
            }
        }

        // set level
        pmcData.TradersInfo[traderID].loyaltyLevel = targetLevel;
    }

    /**
     * Get the next update timestamp for a trader
     * @param traderID Trader to look up update value for
     * @returns future timestamp
     */
    public getNextUpdateTimestamp(traderID: string): number
    {
        const time = this.timeUtil.getTimestamp();
        const updateSeconds = this.getTraderUpdateSeconds(traderID);
        return time + updateSeconds;
    }

    /**
     * Get the reset time between trader assort refreshes in seconds
     * @param traderId Trader to look up
     * @returns Time in seconds
     */
    public getTraderUpdateSeconds(traderId: string): number
    {
        const traderDetails = this.traderConfig.updateTime.find(x => x.traderId === traderId);
        if (!traderDetails)
        {
            this.logger.warning(this.localisationService.getText("trader-missing_trader_details_using_default_refresh_time", {traderId: traderId, updateTime: this.traderConfig.updateTimeDefault}));
            this.traderConfig.updateTime.push(  // create temporary entry to prevent logger spam
                {
                    traderId: traderId,
                    seconds: this.traderConfig.updateTimeDefault
                }
            );
        }
        else
        {
            return traderDetails.seconds;
        }
    }

    /**
    * check if an item is allowed to be sold to a trader
    * @param categoriesTraderBuys array of allowed categories
    * @param tplToCheck itemTpl of inventory
    * @returns boolean if item can be sold to trader
    */
    public doesTraderBuyItem(categoriesTraderBuys: string[], tplToCheck: string): boolean
    {
        for (const category of categoriesTraderBuys)
        {
            const itemsWithParentOfAllowedCategory = this.handbookHelper.templatesWithParent(category);
            if (itemsWithParentOfAllowedCategory.includes(tplToCheck))
            {
                return true;
            }

            for (const subCat of this.handbookHelper.childrenCategories(category))
            {
                const items = this.handbookHelper.templatesWithParent(subCat);
                if (items.includes(tplToCheck))
                {
                    return true;
                }
            }
        }

        return false;
    }

    public getLoyaltyLevel(traderID: string, pmcData: IPmcData): LoyaltyLevel
    {
        const trader = this.databaseServer.getTables().traders[traderID].base;
        let loyaltyLevel = pmcData.TradersInfo[traderID].loyaltyLevel;

        if (!loyaltyLevel || loyaltyLevel < 1)
        {
            loyaltyLevel = 1;
        }

        if (loyaltyLevel > trader.loyaltyLevels.length)
        {
            loyaltyLevel = trader.loyaltyLevels.length;
        }

        return trader.loyaltyLevels[loyaltyLevel - 1];
    }

    /**
     * Store the purchase of an assort from a trader in the player profile
     * @param sessionID Session id
     * @param newPurchaseDetails New item assort id + count
     */
    // eslint-disable-next-line @typescript-eslint/naming-convention
    public addTraderPurchasesToPlayerProfile(sessionID: string, newPurchaseDetails: { items: { item_id: string; count: number; }[]; tid: string; }): void
    {
        const profile = this.profileHelper.getFullProfile(sessionID);
        const traderId = newPurchaseDetails.tid;

        // Iterate over assorts bought and add to profile
        for (const purchasedItem of newPurchaseDetails.items)
        {
            if (!profile.traderPurchases)
            {
                profile.traderPurchases = {};
            }

            if (!profile.traderPurchases[traderId])
            {
                profile.traderPurchases[traderId] = {};
            }

            // Null guard when dict doesnt exist
            const currentTime = this.timeUtil.getTimestamp();
            if (!profile.traderPurchases[traderId][purchasedItem.item_id])
            {
                profile.traderPurchases[traderId][purchasedItem.item_id] =
                {
                    count: purchasedItem.count,
                    purchaseTimestamp: currentTime
                };

                continue;
            }

            profile.traderPurchases[traderId][purchasedItem.item_id].count += purchasedItem.count;
            profile.traderPurchases[traderId][purchasedItem.item_id].purchaseTimestamp = currentTime;
        }
    }

    /**
     * Get the highest rouble price for an item from traders
     * @param tpl Item to look up highest pride for
     * @returns highest rouble cost for item
     */
    public getHighestTraderPriceRouble(tpl: string): number
    {
        if (this.highestTraderPriceItems)
        {
            return this.highestTraderPriceItems[tpl];
        }

        // Init dict and fill
        this.highestTraderPriceItems = {};
        for (const traderName in Traders)
        {
            // Skip some traders
            if (traderName === Traders.FENCE)
            {
                continue;
            }

            // Get assorts for trader, skip trader if no assorts found
            const traderAssorts = this.databaseServer.getTables().traders[Traders[traderName]].assort;
            if (!traderAssorts)
            {
                continue;
            }

            // Get all item assorts that have parentid of hideout (base item and not a mod of other item)
            for (const item of traderAssorts.items.filter(x => x.parentId === "hideout"))
            {
                // Get barter scheme (contains cost of item)
                const barterScheme = traderAssorts.barter_scheme[item._id][0][0];

                // Convert into roubles
                const roubleAmount = barterScheme._tpl === Money.ROUBLES
                    ? barterScheme.count
                    : this.handbookHelper.inRUB(barterScheme.count, barterScheme._tpl);

                // Existing price smaller in dict than current iteration, overwrite
                if (this.highestTraderPriceItems[item._tpl] ?? 0 < roubleAmount)
                {
                    this.highestTraderPriceItems[item._tpl] = roubleAmount;
                }
            }
        }

        return this.highestTraderPriceItems[tpl];
    }
}