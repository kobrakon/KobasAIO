import { inject, injectable } from "tsyringe";

import { DataCallbacks } from "../../callbacks/DataCallbacks";
import { DynamicRouter, RouteAction } from "../../di/Router";

@injectable()
export class DataDynamicRouter extends DynamicRouter 
{
    constructor(
        @inject("DataCallbacks") protected dataCallbacks: DataCallbacks
    ) 
    {
        super(
            [
                new RouteAction(
                    "/client/menu/locale/",
                    // eslint-disable-next-line @typescript-eslint/no-unused-vars
                    (url: string, info: any, sessionID: string, output: string): any =>
                    {
                        return this.dataCallbacks.getLocalesMenu(url, info, sessionID);
                    }
                ),
                new RouteAction(
                    "/client/locale/",
                    // eslint-disable-next-line @typescript-eslint/no-unused-vars
                    (url: string, info: any, sessionID: string, output: string): any =>
                    {
                        return this.dataCallbacks.getLocalesGlobal(url, info, sessionID);
                    }
                ),
                new RouteAction(
                    "/client/items/prices/", 
                    // eslint-disable-next-line @typescript-eslint/no-unused-vars
                    (url: string, info: any, sessionID: string, output: string): any => 
                    {
                        return this.dataCallbacks.getItemPrices(url, info, sessionID);
                    })
            ]
        );
    }
}