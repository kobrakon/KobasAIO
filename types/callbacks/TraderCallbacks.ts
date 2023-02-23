import { inject, injectable } from "tsyringe";
import { OnLoad } from "../di/OnLoad";
import { OnUpdate } from "../di/OnUpdate";

import { TraderController } from "../controllers/TraderController";
import { IEmptyRequestData } from "../models/eft/common/IEmptyRequestData";
import { IBarterScheme, ITraderAssort, ITraderBase } from "../models/eft/common/tables/ITrader";
import { IGetBodyResponseData } from "../models/eft/httpResponse/IGetBodyResponseData";
import { HttpResponseUtil } from "../utils/HttpResponseUtil";

@injectable()
export class TraderCallbacks implements OnLoad, OnUpdate
{
    constructor(
        @inject("HttpResponseUtil") protected httpResponse: HttpResponseUtil,
        @inject("TraderController") protected traderController: TraderController) // TODO: delay required
    {
    }
    public async onLoad(): Promise<void>
    {
        this.traderController.load();
    }

    public async onUpdate(): Promise<boolean>
    {
        return this.traderController.update();
    }

    public getRoute(): string 
    {
        return "aki-traders";
    }

    public getTraderSettings(url: string, info: IEmptyRequestData, sessionID: string): IGetBodyResponseData<ITraderBase[]>
    {
        return this.httpResponse.getBody(this.traderController.getAllTraders(sessionID));
    }

    /**
     * Handle client/trading/api/getUserAssortPrice/trader
     * @returns 
     */
    public getProfilePurchases(url: string, info: IEmptyRequestData, sessionID: string): IGetBodyResponseData<Record<string, IBarterScheme[][]>>
    {
        const traderID = url.substr(url.lastIndexOf("/") + 1);
        return this.httpResponse.getBody(this.traderController.getPurchasesData(sessionID, traderID));
    }

    public getTrader(url: string, info: IEmptyRequestData, sessionID: string): IGetBodyResponseData<ITraderBase>
    {
        const traderID = url.replace("/client/trading/api/getTrader/", "");
        return this.httpResponse.getBody(this.traderController.getTrader(sessionID, traderID));
    }

    public getAssort(url: string, info: IEmptyRequestData, sessionID: string): IGetBodyResponseData<ITraderAssort>
    {
        const traderID = url.replace("/client/trading/api/getTraderAssort/", "");
        return this.httpResponse.getBody(this.traderController.getAssort(sessionID, traderID));
    }
}