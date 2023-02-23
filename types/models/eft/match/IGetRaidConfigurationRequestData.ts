export interface IGetRaidConfigurationRequestData
{
    timeVariant: string
    raidMode: string
    metabolismDisabled: boolean
    playersSpawnPlace: string
    timeAndWeatherSettings: TimeAndWeatherSettings
    botSettings: BotSettings
    wavesSettings: WavesSettings
    location: string
}

//example
// {
//     "timeVariant": "CURR",
//     "raidMode": "Local",
//     "metabolismDisabled": false,
//     "playersSpawnPlace": "SamePlace",
//     "timeAndWeatherSettings": {
//         "isRandomTime": false,
//         "isRandomWeather": false,
//         "cloudinessType": "Clear",
//         "rainType": "NoRain",
//         "windType": "Light",
//         "fogType": "NoFog",
//         "timeFlowType": "x1",
//         "hourOfDay": -1
//     },
//     "botSettings": {
//         "isScavWars": false,
//         "botAmount": "AsOnline"
//     },
//     "wavesSettings": {
//         "botAmount": "AsOnline",
//         "botDifficulty": "AsOnline",
//         "isBosses": true,
//         "isTaggedAndCursed": false
//     },
//     "location": "Streets of Tarkov"
// }
  

export interface TimeAndWeatherSettings
{
    isRandomTime: boolean
    isRandomWeather: boolean
    cloudinessType: string
    rainType: string
    windType: string
    fogType: string
    timeFlowType: string
    hourOfDay: number
}
  
export interface BotSettings
{
    isScavWars: boolean
    botAmount: string
}
  
export interface WavesSettings
{
    botAmount: string
    botDifficulty: string
    isBosses: boolean
    isTaggedAndCursed: boolean
}
  