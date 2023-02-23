import { inject, injectable } from "tsyringe";

import { HideoutCallbacks } from "../../callbacks/HideoutCallbacks";
import { HandledRoute, ItemEventRouterDefinition } from "../../di/Router";
import { IPmcData } from "../../models/eft/common/IPmcData";
import { IItemEventRouterResponse } from "../../models/eft/itemEvent/IItemEventRouterResponse";
import { HideoutEventActions } from "../../models/enums/HideoutEventActions";

@injectable()
export class HideoutItemEventRouter extends ItemEventRouterDefinition 
{
    constructor(
        @inject("HideoutCallbacks") protected hideoutCallbacks: HideoutCallbacks
    ) 
    {
        super();
    }

    public override getHandledRoutes(): HandledRoute[] 
    {
        return [
            new HandledRoute(HideoutEventActions.HIDEOUT_UPGRADE, false),
            new HandledRoute(HideoutEventActions.HIDEOUT_UPGRADE_COMPLETE, false),
            new HandledRoute(HideoutEventActions.HIDEOUT_PUT_ITEMS_IN_AREA_SLOTS, false),
            new HandledRoute(HideoutEventActions.HIDEOUT_TAKE_ITEMS_FROM_AREA_SLOTS, false),
            new HandledRoute(HideoutEventActions.HIDEOUT_TOGGLE_AREA, false),
            new HandledRoute(HideoutEventActions.HIDEOUT_SINGLE_PRODUCTION_START, false),
            new HandledRoute(HideoutEventActions.HIDEOUT_SCAV_CASE_PRODUCTION_START, false),
            new HandledRoute(HideoutEventActions.HIDEOUT_CONTINUOUS_PRODUCTION_START, false),
            new HandledRoute(HideoutEventActions.HIDEOUT_TAKE_PRODUCTION, false),
            new HandledRoute(HideoutEventActions.HIDEOUT_RECORD_SHOOTING_RANGE_POINTS, false),
            new HandledRoute(HideoutEventActions.HIDEOUT_IMPROVE_AREA, false)
        ];
    }

    public override handleItemEvent(url: string, pmcData: IPmcData, body: any, sessionID: string): IItemEventRouterResponse 
    {
        switch (url)
        {
            case HideoutEventActions.HIDEOUT_UPGRADE:
                return this.hideoutCallbacks.upgrade(pmcData, body, sessionID);
            case HideoutEventActions.HIDEOUT_UPGRADE_COMPLETE:
                return this.hideoutCallbacks.upgradeComplete(pmcData, body, sessionID);
            case HideoutEventActions.HIDEOUT_PUT_ITEMS_IN_AREA_SLOTS:
                return this.hideoutCallbacks.putItemsInAreaSlots(pmcData, body, sessionID);
            case HideoutEventActions.HIDEOUT_TAKE_ITEMS_FROM_AREA_SLOTS:
                return this.hideoutCallbacks.takeItemsFromAreaSlots(pmcData, body, sessionID);
            case HideoutEventActions.HIDEOUT_TOGGLE_AREA:
                return this.hideoutCallbacks.toggleArea(pmcData, body, sessionID);
            case HideoutEventActions.HIDEOUT_SINGLE_PRODUCTION_START:
                return this.hideoutCallbacks.singleProductionStart(pmcData, body, sessionID);
            case HideoutEventActions.HIDEOUT_SCAV_CASE_PRODUCTION_START:
                return this.hideoutCallbacks.scavCaseProductionStart(pmcData, body, sessionID);
            case HideoutEventActions.HIDEOUT_CONTINUOUS_PRODUCTION_START:
                return this.hideoutCallbacks.continuousProductionStart(pmcData, body, sessionID);
            case HideoutEventActions.HIDEOUT_TAKE_PRODUCTION:
                return this.hideoutCallbacks.takeProduction(pmcData, body, sessionID);
            case HideoutEventActions.HIDEOUT_RECORD_SHOOTING_RANGE_POINTS:
                return this.hideoutCallbacks.recordShootingRangePoints(pmcData, body, sessionID);
            case HideoutEventActions.HIDEOUT_IMPROVE_AREA:
                return this.hideoutCallbacks.improveArea(pmcData, body, sessionID);
        }
    }
}