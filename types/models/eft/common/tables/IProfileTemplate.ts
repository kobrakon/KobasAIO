import { Dialogue, WeaponBuild } from "../../profile/IAkiProfile";
import { IPmcData } from "../IPmcData";

export interface IProfileTemplates
{
    Standard: IProfileSides
    // eslint-disable-next-line @typescript-eslint/naming-convention
    "Left Behind": IProfileSides
    // eslint-disable-next-line @typescript-eslint/naming-convention
    "Prepare To Escape": IProfileSides
    // eslint-disable-next-line @typescript-eslint/naming-convention
    "Edge Of Darkness": IProfileSides
}

export interface IProfileSides
{
    usec: TemplateSide
    bear: TemplateSide
}

export interface TemplateSide
{
    character: IPmcData
    suits: string[]
    dialogues: Record<string, Dialogue>
    weaponbuilds: WeaponBuild[]
    trader: ProfileTraderTemplate
}

export interface ProfileTraderTemplate
{
    initialLoyaltyLevel: number
    setQuestsAvailableForStart?: boolean
    setQuestsAvailableForFinish?: boolean
    initialStanding: number
    initialSalesSum: number
    jaegerUnlocked: boolean
}