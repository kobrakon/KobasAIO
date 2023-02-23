import { inject, injectable } from "tsyringe";

import { NoteCallbacks } from "../../callbacks/NoteCallbacks";
import { HandledRoute, ItemEventRouterDefinition } from "../../di/Router";
import { IPmcData } from "../../models/eft/common/IPmcData";
import { IItemEventRouterResponse } from "../../models/eft/itemEvent/IItemEventRouterResponse";

@injectable()
export class NoteItemEventRouter extends ItemEventRouterDefinition 
{
    constructor(
        @inject("NoteCallbacks") protected noteCallbacks: NoteCallbacks // TODO: delay required
    ) 
    {
        super();
    }

    public override getHandledRoutes(): HandledRoute[] 
    {
        return [
            new HandledRoute("AddNote", false),
            new HandledRoute("EditNote", false),
            new HandledRoute("DeleteNote", false)
        ];
    }

    public override handleItemEvent(url: string, pmcData: IPmcData, body: any, sessionID: string): IItemEventRouterResponse 
    {
        switch (url)
        {
            case "AddNote":
                return this.noteCallbacks.addNote(pmcData, body, sessionID);
            case "EditNote":
                return this.noteCallbacks.editNote(pmcData, body, sessionID);  
            case "DeleteNote":
                return this.noteCallbacks.deleteNote(pmcData, body, sessionID);            
        }
    }
}