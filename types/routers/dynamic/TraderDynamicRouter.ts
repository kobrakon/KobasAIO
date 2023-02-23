import { inject, injectable } from "tsyringe";

import { TraderCallbacks } from "../../callbacks/TraderCallbacks";
import { DynamicRouter, RouteAction } from "../../di/Router";

@injectable()
export class TraderDynamicRouter extends DynamicRouter 
{
    constructor(
        @inject("TraderCallbacks") protected traderCallbacks: TraderCallbacks
    ) 
    {
        super(
            [
                new RouteAction(
                    "/client/trading/api/getUserAssortPrice/trader/",
                    // eslint-disable-next-line @typescript-eslint/no-unused-vars
                    (url: string, info: any, sessionID: string, output: string): any =>
                    {
                        return this.traderCallbacks.getProfilePurchases(url, info, sessionID);
                    }
                ),
                new RouteAction(
                    "/client/trading/api/getTrader/",
                    // eslint-disable-next-line @typescript-eslint/no-unused-vars
                    (url: string, info: any, sessionID: string, output: string): any =>
                    {
                        return this.traderCallbacks.getTrader(url, info, sessionID);
                    }
                ),
                new RouteAction(
                    "/client/trading/api/getTraderAssort/",
                    // eslint-disable-next-line @typescript-eslint/no-unused-vars
                    (url: string, info: any, sessionID: string, output: string): any =>
                    {
                        return this.traderCallbacks.getAssort(url, info, sessionID);
                    }
                )
            ]
        );
    }
}