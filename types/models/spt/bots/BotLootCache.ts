import { ITemplateItem } from "../../eft/common/tables/ITemplateItem"

export class BotLootCache
{
    backpackLoot: ITemplateItem[]
    pocketLoot: ITemplateItem[]
    vestLoot: ITemplateItem[]
    combinedPoolLoot: ITemplateItem[]

    specialItems: ITemplateItem[]
    healingItems: ITemplateItem[]
    drugItems: ITemplateItem[]
    stimItems: ITemplateItem[]
    grenadeItems: ITemplateItem[]
}

export enum LootCacheType
    {
    SPECIAL = "Special",
    BACKPACK = "Backpack",
    POCKET = "Pocket",
    VEST = "Vest",
    COMBINED = "Combined",
    HEALING_ITEMS = "HealingItems",
    DRUG_ITEMS = "DrugItems",
    STIM_ITEMS = "StimItems",
    GRENADE_ITEMS = "GrenadeItems"

}