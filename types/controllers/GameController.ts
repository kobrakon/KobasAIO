import { inject, injectable } from "tsyringe";

import { ApplicationContext } from "../context/ApplicationContext";
import { ContextVariableType } from "../context/ContextVariableType";
import { HideoutHelper } from "../helpers/HideoutHelper";
import { HttpServerHelper } from "../helpers/HttpServerHelper";
import { ProfileHelper } from "../helpers/ProfileHelper";
import { PreAkiModLoader } from "../loaders/PreAkiModLoader";
import { IEmptyRequestData } from "../models/eft/common/IEmptyRequestData";
import { IPmcData } from "../models/eft/common/IPmcData";
import { BodyPartHealth } from "../models/eft/common/tables/IBotBase";
import { ICheckVersionResponse } from "../models/eft/game/ICheckVersionResponse";
import { IGameConfigResponse } from "../models/eft/game/IGameConfigResponse";
import { IServerDetails } from "../models/eft/game/IServerDetails";
import { IAkiProfile } from "../models/eft/profile/IAkiProfile";
import { ConfigTypes } from "../models/enums/ConfigTypes";
import { ICoreConfig } from "../models/spt/config/ICoreConfig";
import { IHttpConfig } from "../models/spt/config/IHttpConfig";
import { ILocationConfig } from "../models/spt/config/ILocationConfig";
import { ILocationData } from "../models/spt/server/ILocations";
import { ILogger } from "../models/spt/utils/ILogger";
import { ConfigServer } from "../servers/ConfigServer";
import { DatabaseServer } from "../servers/DatabaseServer";
import { CustomLocationWaveService } from "../services/CustomLocationWaveService";
import { LocalisationService } from "../services/LocalisationService";
import { OpenZoneService } from "../services/OpenZoneService";
import { ProfileFixerService } from "../services/ProfileFixerService";
import { SeasonalEventService } from "../services/SeasonalEventService";
import { TimeUtil } from "../utils/TimeUtil";

@injectable()
export class GameController
{
    protected httpConfig: IHttpConfig;
    protected coreConfig: ICoreConfig;
    protected locationConfig: ILocationConfig;

    constructor(
        @inject("WinstonLogger") protected logger: ILogger,
        @inject("DatabaseServer") protected databaseServer: DatabaseServer,
        @inject("TimeUtil") protected timeUtil: TimeUtil,
        @inject("PreAkiModLoader") protected preAkiModLoader: PreAkiModLoader,
        @inject("HttpServerHelper") protected httpServerHelper: HttpServerHelper,
        @inject("HideoutHelper") protected hideoutHelper: HideoutHelper,
        @inject("ProfileHelper") protected profileHelper: ProfileHelper,
        @inject("ProfileFixerService") protected profileFixerService: ProfileFixerService,
        @inject("LocalisationService") protected localisationService: LocalisationService,
        @inject("CustomLocationWaveService") protected customLocationWaveService: CustomLocationWaveService,
        @inject("OpenZoneService") protected openZoneService: OpenZoneService,
        @inject("SeasonalEventService") protected seasonalEventService: SeasonalEventService,
        @inject("ApplicationContext") protected applicationContext: ApplicationContext,
        @inject("ConfigServer") protected configServer: ConfigServer
    )
    {
        this.httpConfig = this.configServer.getConfig(ConfigTypes.HTTP);
        this.coreConfig = this.configServer.getConfig(ConfigTypes.CORE);
        this.locationConfig = this.configServer.getConfig(ConfigTypes.LOCATION);
    }

    public gameStart(_url: string, _info: IEmptyRequestData, sessionID: string, startTimeStampMS: number): void
    {
        // Store start time in app context
        this.applicationContext.addValue(ContextVariableType.CLIENT_START_TIMESTAMP, startTimeStampMS);

        this.openZoneService.applyZoneChangesToAllMaps();
        this.customLocationWaveService.applyWaveChangesToAllMaps();

        // repeatableQuests are stored by in profile.Quests due to the responses of the client (e.g. Quests in offraidData)
        // Since we don't want to clutter the Quests list, we need to remove all completed (failed / successful) repeatable quests.
        // We also have to remove the Counters from the repeatableQuests
        if (sessionID)
        {
            const fullProfile = this.profileHelper.getFullProfile(sessionID);
            const pmcProfile = fullProfile.characters.pmc;

            if (pmcProfile.Health)
            {
                this.updateProfileHealthValues(pmcProfile);
            }

            if (this.locationConfig.fixEmptyBotWaves)
            {
                this.fixBrokenOfflineMapWaves();
            }

            if (this.locationConfig.fixRoguesTakingAllSpawnsOnLighthouse)
            {
                this.fixRoguesSpawningInstantlyOnLighthouse();
            }

            this.profileFixerService.removeLegacyScavCaseProductionCrafts(pmcProfile);

            this.profileFixerService.addMissingHideoutAreasToProfile(fullProfile);

            this.profileFixerService.checkForAndFixPmcProfileIssues(pmcProfile);

            this.profileFixerService.addMissingAkiVersionTagToProfile(fullProfile);

            if (pmcProfile.Hideout)
            {
                this.profileFixerService.addMissingHideoutBonusesToProfile(pmcProfile);
                this.profileFixerService.addMissingUpgradesPropertyToHideout(pmcProfile);
                this.hideoutHelper.setHideoutImprovementsToCompleted(pmcProfile);
                this.hideoutHelper.unlockHideoutWallInProfile(pmcProfile);
            }

            if (pmcProfile.Inventory)
            {
                this.profileFixerService.checkForOrphanedModdedItems(pmcProfile);
            }
            
            this.logProfileDetails(fullProfile);

            this.adjustLabsRaiderSpawnRate();

            this.removePraporTestMessage();

            this.saveActiveModsToProfile(fullProfile);

            if (pmcProfile.Info)
            {
                this.addPlayerToPMCNames(pmcProfile);
            }

            if (this.seasonalEventService.isAutomaticEventDetectionEnabled())
            {
                this.seasonalEventService.checkForAndEnableSeasonalEvents();
            }
        }
    }

    /**
     * When player logs in, iterate over all active effects and reduce timer
     * TODO - add body part HP regen
     * @param pmcProfile 
     */
    protected updateProfileHealthValues(pmcProfile: IPmcData): void
    {
        const healthLastUpdated = pmcProfile.Health.UpdateTime;
        const currentTimeStamp = this.timeUtil.getTimestamp();
        const diffSeconds = currentTimeStamp - healthLastUpdated;

        // last update is in past
        if (healthLastUpdated < currentTimeStamp)
        {
            // Base values
            let energyRegenPerHour = 60;
            let hydrationRegenPerHour = 60;
            let hpRegenPerHour = 456.6;

            // Set new values, whatever is smallest
            energyRegenPerHour += pmcProfile.Bonuses.filter(x => x.type === "EnergyRegeneration").reduce((sum, curr) => sum += curr.value, 0);
            hydrationRegenPerHour += pmcProfile.Bonuses.filter(x => x.type === "HydrationRegeneration").reduce((sum, curr) => sum += curr.value, 0);
            hpRegenPerHour += pmcProfile.Bonuses.filter(x => x.type === "HealthRegeneration").reduce((sum, curr) => sum += curr.value, 0);

            if (pmcProfile.Health.Energy.Current !== pmcProfile.Health.Energy.Maximum)
            {
                // Set new value, whatever is smallest
                pmcProfile.Health.Energy.Current += Math.round((energyRegenPerHour * (diffSeconds / 3600)));
                if (pmcProfile.Health.Energy.Current > pmcProfile.Health.Energy.Maximum)
                {
                    pmcProfile.Health.Energy.Current = pmcProfile.Health.Energy.Maximum;
                }
            }

            if (pmcProfile.Health.Hydration.Current !== pmcProfile.Health.Hydration.Maximum)
            {
                pmcProfile.Health.Hydration.Current += Math.round((hydrationRegenPerHour * (diffSeconds / 3600)));
                if (pmcProfile.Health.Hydration.Current > pmcProfile.Health.Hydration.Maximum)
                {
                    pmcProfile.Health.Hydration.Current = pmcProfile.Health.Hydration.Maximum;
                }
            }

            // Check all body parts
            for (const bodyPartKey in pmcProfile.Health.BodyParts)
            {
                const bodyPart = pmcProfile.Health.BodyParts[bodyPartKey] as BodyPartHealth;
                
                // Check part hp
                if (bodyPart.Health.Current < bodyPart.Health.Maximum)
                {
                    bodyPart.Health.Current += Math.round((hpRegenPerHour * (diffSeconds / 3600)));
                }
                if (bodyPart.Health.Current > bodyPart.Health.Maximum)
                {
                    bodyPart.Health.Current = bodyPart.Health.Maximum;
                }
                
                // Look for effects
                if (Object.keys(bodyPart.Effects ?? {}).length > 0)
                {
                    // Decrement effect time value by difference between current time and time health was last updated
                    for (const effectKey in bodyPart.Effects)
                    {
                        // Skip effects below 1, .e.g. bleeds at -1
                        if (bodyPart.Effects[effectKey].Time < 1)
                        {
                            continue;
                        }

                        bodyPart.Effects[effectKey].Time -= diffSeconds;
                        if (bodyPart.Effects[effectKey].Time < 1)
                        {
                            // effect time was sub 1, set floor it can be
                            bodyPart.Effects[effectKey].Time = 1;
                        }
                    }
                }
            }
            pmcProfile.Health.UpdateTime = currentTimeStamp;
        }
    }

    /**
     * Waves with an identical min/max values spawn nothing, the number of bots that spawn is the difference between min and max
     */
    protected fixBrokenOfflineMapWaves(): void
    {
        const ignoreList = ["base", "develop", "hideout", "privatearea", "suburbs", "terminal", "town"];
        for (const locationKey in this.databaseServer.getTables().locations)
        {
            if (ignoreList.includes(locationKey))
            {
                continue;
            }

            const location: ILocationData = this.databaseServer.getTables().locations[locationKey];
            for (const wave of location.base.waves)
            {
                if (wave.slots_min === wave.slots_max && wave.WildSpawnType !== "marksman")
                {
                    this.logger.debug(`Fixed map ${locationKey} wave ${wave.number} of type ${wave.WildSpawnType} in zone ${wave.SpawnPoints}`);
                    wave.slots_max++;
                }
            }
        }
    }

    /**
     * Make Rogues spawn later to allow for scavs to spawn first instead of rogues filling up all spawn positions
     */
    protected fixRoguesSpawningInstantlyOnLighthouse(): void
    {
        const lighthouse = this.databaseServer.getTables().locations["lighthouse"].base;
        for (const wave of lighthouse.BossLocationSpawn)
        {
            if (wave.BossName === "exUsec" && wave.Time === -1)
            {
                wave.Time = this.locationConfig.lighthouseRogueSpawnTimeSeconds;
            }
        }
    }

    /**
     * Get a list of installed mods and save their details to the profile being used
     * @param fullProfile Profile to add mod details to
     */
    protected saveActiveModsToProfile(fullProfile: IAkiProfile): void
    {
        // Add empty mod array if undefined
        if (!fullProfile.aki.mods)
        {
            fullProfile.aki.mods = [];
        }

        // Get active mods
        const activeMods = this.preAkiModLoader.getImportedModDetails();
        for (const modKey in activeMods)
        {
            const modDetails = activeMods[modKey];
            if (fullProfile.aki.mods.some(x => x.author === modDetails.author
                && x.name === modDetails.name
                && x.version === modDetails.version))
            {
                // Exists already, skip
                continue;
            }

            fullProfile.aki.mods.push({
                author: modDetails.author,
                dateAdded: Date.now(),
                name: modDetails.name,
                version: modDetails.version
            });
        }
    }

    /**
     * Add the logged in players name to PMC name pool
     * @param pmcProfile 
     */
    protected addPlayerToPMCNames(pmcProfile: IPmcData): void
    {
        const playerName = pmcProfile.Info.Nickname;

        if (playerName)
        {
            const bots = this.databaseServer.getTables().bots.types;

            if (bots["bear"])
            {
                bots["bear"].firstName.push(playerName);
                bots["bear"].firstName.push(`Evil ${playerName}`);
            }
            
            if (bots["usec"])
            {
                bots["usec"].firstName.push(playerName);
                bots["usec"].firstName.push(`Evil ${playerName}`);
            } 
        }
    }

    /**
     * Blank out the "test" mail message from prapor
     */
    protected removePraporTestMessage(): void
    {
        // Iterate over all langauges (e.g. "en", "fr")
        for (const localeKey in this.databaseServer.getTables().locales.global)
        {
            this.databaseServer.getTables().locales.global[localeKey]["61687e2c3e526901fa76baf9"] = "";
        }
    }

    /**
     * Make non-trigger-spawned raiders spawn earlier + always
     */
    protected adjustLabsRaiderSpawnRate(): void
    {
        const labsBase = this.databaseServer.getTables().locations.laboratory.base;
        const nonTriggerLabsBossSpawns = labsBase.BossLocationSpawn.filter(x => x.TriggerId === "" && x.TriggerName === "");
        if (nonTriggerLabsBossSpawns)
        {
            for (const boss of nonTriggerLabsBossSpawns)
            {
                boss.BossChance = 100;
                boss.Time /= 10;
            }
        }
    }

    protected logProfileDetails(fullProfile: IAkiProfile): void
    {
        this.logger.debug(`Profile made with: ${fullProfile.aki.version}`);
        this.logger.debug(`Server version: ${this.coreConfig.akiVersion}`);
        this.logger.debug(`Debug enabled: ${globalThis.G_DEBUG_CONFIGURATION}`);
        this.logger.debug(`Mods enabled: ${globalThis.G_MODS_ENABLED}`);
    }

    public getGameConfig(sessionID: string): IGameConfigResponse
    {
        const config: IGameConfigResponse = {
            languages: this.databaseServer.getTables().locales.languages,
            ndaFree: false,
            reportAvailable: false,
            twitchEventMember: false,
            lang: "en",
            aid: sessionID,
            taxonomy: 6,
            activeProfileId: `pmc${sessionID}`,
            backend: {
                Lobby: this.httpServerHelper.getBackendUrl(),
                Trading: this.httpServerHelper.getBackendUrl(),
                Messaging: this.httpServerHelper.getBackendUrl(),
                Main: this.httpServerHelper.getBackendUrl(),
                RagFair: this.httpServerHelper.getBackendUrl()
            },
            // eslint-disable-next-line @typescript-eslint/naming-convention
            utc_time: new Date().getTime() / 1000,
            totalInGame: 1
        };

        return config;
    }

    public getServer(): IServerDetails[]
    {
        return [
            {
                ip: this.httpConfig.ip,
                port: this.httpConfig.port
            }
        ];
    }

    public getValidGameVersion(): ICheckVersionResponse
    {
        return {
            isvalid: true,
            latestVersion: this.coreConfig.compatibleTarkovVersion
        };
    }
}