import { injectable } from "tsyringe";

import { HandledRoute, SaveLoadRouter } from "../../di/Router";
import { IPmcData } from "../../models/eft/common/IPmcData";
import { IAkiProfile } from "../../models/eft/profile/IAkiProfile";

@injectable()
export class ProfileSaveLoadRouter extends SaveLoadRouter 
{
    constructor() 
    {
        super();
    }

    public override getHandledRoutes(): HandledRoute[] 
    {
        return [
            new HandledRoute("aki-profile", false)
        ];
    }

    public override handleLoad(profile: IAkiProfile): IAkiProfile 
    {
        if (profile.characters === null)
        {
            profile.characters = {
                pmc: {} as IPmcData,
                scav: {} as IPmcData
            };
        }
        return profile;
    }
}