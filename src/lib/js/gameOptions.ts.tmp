import { Configuration } from "./configuration"
import { Persist } from "./persist.svelte"
import type { EventList } from "./types"

export interface GreyscaleSettings {
    in_events: boolean,
    end_of_day_summary: boolean,
    end_of_game_summary: boolean,
}

export const enum RequiredFatalitiesMode {
    Disable = 'Disable',
    Percent = 'Percent',
    Absolute = 'Absolute',
}

export interface GameOptions {
    required_fatalities_mode: RequiredFatalitiesMode,
    required_fatalities: number
    starting_day?: number
    greyscale_settings: GreyscaleSettings
}

export const BuiltinDefaultConfig: Configuration.V1.Config = Object.freeze({
    version: 1,
    events: Object.freeze({
        bloodbath: [],
        day: [],
        night: [],
        feast:[],
        all: []
    }),
    tags: []
})

export const GameSettings = Persist('hgs_settings', {
    required_fatalities: 0,
    required_fatalities_mode: RequiredFatalitiesMode.Disable,
    starting_day: undefined,
    greyscale_settings: {
        in_events: false,
        end_of_game_summary: false,
        end_of_day_summary: true
    }
} as GameOptions)