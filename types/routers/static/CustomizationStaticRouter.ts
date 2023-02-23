import { inject, injectable } from "tsyringe";

import { CustomizationCallbacks } from "../../callbacks/CustomizationCallbacks";
import { RouteAction, StaticRouter } from "../../di/Router";

@injectable()
export class CustomizationStaticRouter extends StaticRouter 
{
    constructor(
        @inject("CustomizationCallbacks") protected customizationCallbacks: CustomizationCallbacks
    ) 
    {
        super(
            [
                new RouteAction(
                    "/client/trading/customization/storage",
                    // eslint-disable-next-line @typescript-eslint/no-unused-vars
                    (url: string, info: any, sessionID: string, output: string): any => 
                    {
                        return this.customizationCallbacks.getSuits(url, info, sessionID);
                    }
                )
            ]
        );
    }
}