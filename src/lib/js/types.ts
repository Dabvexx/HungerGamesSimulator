import { ComposeEventMessage, type FormattedMessage } from "./eventMessage"
import type { Tribute } from "./tribute"
import { Event } from "./events"


/** The event list holding all the events in the game. */
export interface GameEventList {
    bloodbath: Event[],
    day: Event[],
    night: Event[],
    feast: Event[]
}

/** An event list that may contain events for different stages. */
export interface EventList<T = Event> {
    bloodbath?: T[],
    day?: T[],
    night?: T[],
    feast?: T[]
    all?: T[]
}

/** An in-game event. */
export class GameEvent {
    event: Event
    players_involved: Tribute[]
    message: FormattedMessage

    constructor(event: any, players_involved: any) {
        this.event = event
        this.players_involved = players_involved
        this.message = ComposeEventMessage(this)
    }
}

/** A single round in the game. */
export interface GameRound {
    game_events: GameEvent[],
    died_this_round: Tribute[],
    index: number,
    stage: GameStage
}

export enum GameStage {
    BLOODBATH = 'bloodbath',
    DAY = 'day',
    NIGHT = 'night',
    FEAST = 'feast'
}
