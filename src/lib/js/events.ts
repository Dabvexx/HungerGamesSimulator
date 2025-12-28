import { Tag } from "./tag"
import { char_zero, char_nine, isdigit } from "./utils"
import { type EventList } from "./types"

/** Calculate the number of tributes required based on the message template. */
export function CalculateTributesInvolved(raw_message: string): number {
    const v_raw = raw_message.match(/%[NAGRsyih!]?(\d)/g)
        ?.map(x => +x.slice(-1))
        ?.reduce((prev, curr) => Math.max(prev, curr), 0)
    const value = typeof v_raw === 'undefined' ? 0 : v_raw + 1
    return Number.isFinite(value) ? value : 0
}

/** A requirement that must be satisfied for an event to be eligible. */
interface TagRequirement {
    tag: Tag
    player_index: number
}

export type EventListKey = keyof EventList

/** An event in the event list (NOT in game; for that, see `GameEvent`). */
export class Event {
    static __last_id = -1
    static readonly list_keys = ['day', 'all', 'feast', 'night', 'bloodbath'] as const satisfies EventListKey[]
    static readonly list_keys_logical_order = ['bloodbath', 'day', 'night', 'feast', 'all'] as const satisfies EventListKey[]

    message: string
    players_involved: number
    fatalities: number[]
    killers: number[]
    // Temp disabled as I learn how svelte reactivity works and svelte components
    //enabled: boolean = $state(true)
    enabled: boolean = true
    id: number
    type: string
    requirements: TagRequirement[]

    constructor(message: string, fatalities: number[] = [], killers: number[] = [], type = 'BUILTIN') {
        this.message = message.trim()
        if (this.message.length === 0)
            throw Error(`Event message cannot be empty!`)

        this.players_involved = Math.max(CalculateTributesInvolved(message))
        if (this.players_involved < 1 || this.players_involved > 9 || !Number.isFinite(this.players_involved))
            throw Error(`Event '${message}' is ill-formed since it would involve '${this.players_involved}' players\n(must be between 1 and 9)!`)

        if (Math.max(...fatalities) >= this.players_involved)
            throw Error(`Deaths '${fatalities.toString()}' are invalid: the event only involves ${this.players_involved} players!`)

        if (Math.max(...killers) >= this.players_involved)
            throw Error(`Killers '${killers.toString()}' are invalid: the event only involves ${this.players_involved} players!`)

        this.fatalities = fatalities
        this.killers = killers
        this.id = ++Event.__last_id
        this.type = type
        this.requirements = []
    }

    /** !!IMPORTANT!! */
    /** Add a requirement to this event */
    require(tag: Tag, player_index: number): this {
        if (player_index >= this.players_involved)
            throw Error(`Cannot add requirement for player ${player_index} since the event only involves ${this.players_involved} players`)

        /// Make sure to not add the same requirement twice.
        if (!this.requirements.find(r => r.tag == tag && r.player_index == player_index)) this.requirements.push({
            tag,
            player_index
        })
        return this
    }
}