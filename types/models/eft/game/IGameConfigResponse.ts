export interface IGameConfigResponse
{
    aid: string
    lang: string
    languages: Record<string, string>
    ndaFree: boolean
    taxonomy: number
    activeProfileId: string
    backend: Backend
    // eslint-disable-next-line @typescript-eslint/naming-convention
    utc_time: number
    /** Total in game time */
    totalInGame: number
    reportAvailable: boolean
    twitchEventMember: boolean
}
  
export interface Backend
{
    Lobby: string
    Trading: string
    Messaging: string
    Main: string
    RagFair: string
}