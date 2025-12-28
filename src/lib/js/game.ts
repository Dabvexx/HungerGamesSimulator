import { type GreyscaleSettings } from "./settings"
import { ParsePronounsFromCharacterCreation, Tribute, type TributeCharacterSelectOptions } from "./tribute"
import type { FormattedMessage } from "./eventMessage"
import { ComposeEventMessage } from "./eventMessage"
import { GameSettings } from "./gameOptions"
import { TitleCase, clamp, randomInt, shuffle } from "./utils"
import { Event } from "./events"
import { GameEvent, GameStage, type EventList, type GameEventList, type GameRound } from "./types"
    import { RequiredFatalitiesMode } from "./gameOptions";

/** The state of the game. */
export const enum GameState {
    DEAD,
    NEW_ROUND,
    IN_ROUND,
    THE_FALLEN,
    END_RESULTS,
    END_WINNER,
    END_SUMMARY_FATALITIES,
    END_SUMMARY_STATS,
    END,
    INITIAL = NEW_ROUND,
}

/** The render state of the game. */
export const enum RenderState {
    GAME_OVER,
    ROUND_EVENTS,
    ROUND_DEATHS,
    WINNERS,
    GAME_DEATHS,
    STATS,
}

/** These correspond to the event lists. */
/* enum GameStage {
    BLOODBATH = 'bloodbath',
    DAY = 'day',
    NIGHT = 'night',
    FEAST = 'feast'
} */

/** An in-game event. */
/*export class GameEvent {
    event: Event
    players_involved: Tribute[]
    message: FormattedMessage

    constructor(event: any, players_involved: any) {
        this.event = event
        this.players_involved = players_involved
        this.message = ComposeEventMessage(this)
    }
}*/

/** A single round in the game. */
/* interface GameRound {
    game_events: GameEvent[],
    died_this_round: Tribute[],
    index: number,
    stage: GameStage
} */

export class GameRenderState {
    /** The render state of the game. */
    readonly state: RenderState

    /** Title to display at the top of the screen. */
    readonly game_title: string

    /** The game rounds. */
    readonly rounds: GameRound[]

    /** The tributes that died this day. */
    readonly tributes_died: Tribute[]

    /** The tributes that are still alive. */
    readonly tributes_alive: Tribute[]

    /** When to render portraits in greyscale. */
    readonly greyscale_settings: GreyscaleSettings

    constructor(
        state: RenderState,
        game_title: string,
        rounds: GameRound[],
        tributes_died: Tribute[],
        tributes_alive: Tribute[],
        greyscale_settings: GreyscaleSettings
    ) {
        this.state = state
        this.game_title = game_title
        this.rounds = rounds
        this.tributes_died = tributes_died
        this.tributes_alive = tributes_alive
        this.greyscale_settings = greyscale_settings
    }

    get deaths() { return this.tributes_died.length }
    get has_alive() { return this.tributes_alive.length > 0 }
    get has_deaths() { return this.deaths > 0 }
    get round() { return this.rounds[this.rounds.length - 1] }
    is(...state: RenderState[]) { return state.includes(this.state) }
}

/** !!IMPORTANT!! */
// This is what will be called to actually run the game (I believe)
export class Game {
    /** All tributes in the game, irrespective of alive or dead. */
    readonly tributes: Tribute[]

    /** All tributes that are still alive. */
    tributes_alive: Tribute[]

    /**
     * All tributes that died since the last time we showed deaths.
     *
     * For instance, if there was a bloodbath, day, and night, this will
     * include the deaths for all three of those rounds.
     */
    #tributes_died: Tribute[] = []

    /** The current state of the game (i.e. of the last round). */
    #state: GameState = GameState.INITIAL

    /** The title of the current round. */
    #game_title: string = ''

    /** The last time a feast happened. */
    last_feast: number = 0

    /** The current game stage. */
    stage: GameStage = GameStage.BLOODBATH

    /** Rate at which events that result in a fatality are rerolled. */
    readonly fatality_reroll_rate: number

    /** Whether every tribute that is still alive has won. */
    all_won: boolean = false

    /** All rounds that have happened since the start of this game. */
    rounds: GameRound[] = []

    /** Number of days that have passed. */
    days_passed: number = 0

    /** Number of nights that have passed. */
    nights_passed: number = 0

    /** Event list used by this game. */
    readonly event_list: GameEventList

    /** Minimum number of fatalities per round. */
    readonly required_fatalities: number | undefined = undefined

    /** Greyscale mode. */
    readonly #greyscale_settings: GreyscaleSettings

    /** Create a new game. */
    constructor(
        tributes: Tribute[],
        events: EventList,
        fatality_reroll_rate: number = .6
    ) {
        this.tributes = [...tributes] // We want our own copy of this.
        this.tributes_alive = [...tributes]
        this.fatality_reroll_rate = fatality_reroll_rate
        this.event_list = {
            bloodbath: [],
            day: [],
            night: [],
            feast: []
        }

        // Set required fatality rate.
        const opts = GameSettings.value
        if (opts.required_fatalities_mode !== RequiredFatalitiesMode.Disable) {
            if (isFinite(opts.required_fatalities)) {
                // Relative to the total number of tributes.
                if (opts.required_fatalities_mode === RequiredFatalitiesMode.Percent) {
                    this.required_fatalities = Math.ceil(
                        (clamp(opts.required_fatalities, 0, 100) / 100.0) * this.tributes.length
                    )
                }

                // Absolute.
                else this.required_fatalities = Math.max(0, opts.required_fatalities)

                // Shouldn’t ever happen, but still.
                if (!isFinite(this.required_fatalities as number)) this.required_fatalities = undefined
            }
        }

        // Set starting day.
        if (opts.starting_day !== undefined)
            this.nights_passed = this.days_passed = Math.max(0, Math.floor(opts.starting_day - 1))

        // Set greyscale mode.
        this.#greyscale_settings = opts.greyscale_settings

        this.#AddEvents(events)
    }

    /** Get the current round. */
    get last_round() { return this.rounds[this.rounds.length - 1] }

    /** Add all events from an event list to the game. */
    #AddEvents(event_option_list: EventList) {
        if (event_option_list.all) {
            for (let event_list of [this.event_list.bloodbath, this.event_list.day, this.event_list.night, this.event_list.feast])
                event_list.push(...event_option_list.all.filter(e => e.enabled))
        }

        for (let property of [GameStage.BLOODBATH, GameStage.DAY, GameStage.NIGHT, GameStage.FEAST])
            if (event_option_list[property])
                this.event_list[property].push(...(<Event[]>event_option_list[property]).filter(e => e.enabled))
    }

    /** The main state machine controlling the game. */
    #AdvanceGame(): GameRenderState {
        const state = this.#TickRenderState()

        // Advance the state and perform and action accordingly.
        switch (this.#state) {
            case GameState.NEW_ROUND:
                this.#state = GameState.IN_ROUND
                this.#StartNewRound()
                this.#DoRound()
                break

            case GameState.IN_ROUND:
                this.#DoRound()
                break

            case GameState.THE_FALLEN:
                this.#game_title = 'The Fallen'
                this.#state = GameState.NEW_ROUND
                break

            case GameState.END_RESULTS:
                this.#game_title = 'The Fallen'
                this.#state = GameState.END_WINNER
                break

            case GameState.END_WINNER:
                this.#game_title = 'The Games Have Ended'
                this.#state = GameState.END_SUMMARY_FATALITIES
                break

            case GameState.END_SUMMARY_FATALITIES:
                this.#game_title = 'Deaths'
                this.#state = GameState.END_SUMMARY_STATS
                break

            case GameState.END_SUMMARY_STATS:
                this.#game_title = this.tributes_alive.length ? 'Winners' : 'The Fallen' // this.DisplayFinalStats()
                this.#state = GameState.END
                break

            case GameState.END:
                break

            default:
                this.#state = GameState.DEAD
                throw new Error('An internal error has occurred; Game.state was ' + this.#state)
        }

        return new GameRenderState(
            state,
            this.#game_title,
            this.rounds,
            this.#state === GameState.END
                ? this.tributes.filter(t => t.died_in_round !== undefined)
                : this.#tributes_died,
            this.tributes_alive,
            this.#greyscale_settings
        );
    }

    /** Determine what the next game stage should be. */
    #AdvanceGameStage(): GameStage {
        // Start of game is always Bloodbath.
        if (this.rounds.length === 0) return GameStage.BLOODBATH

        // Feast and Bloodbath are followed by Day.
        if (this.stage === GameStage.FEAST || this.stage === GameStage.BLOODBATH) {
            this.days_passed++
            return GameStage.DAY
        }

        // Night is followed by Day or Feast.
        if (this.stage === GameStage.NIGHT) {
            // Feast can occur before Day once every 5+ as follows:
            //   - 5 rounds: 25% chance,
            //   - 6 rounds: 33% chance,
            //   - 7+ rounds: 50% chance.
            let rounds_since_feast = this.rounds.length - this.last_feast;
            if (rounds_since_feast >= 5) block: {
                if (rounds_since_feast >= 7) {
                    if (Math.random() > .50 * (rounds_since_feast - 4)) break block
                } else if (rounds_since_feast >= 6) {
                    if (Math.random() > .33 * (rounds_since_feast - 4)) break block
                } else {
                    if (Math.random() > .25 * (rounds_since_feast - 4)) break block
                }

                this.last_feast = this.rounds.length;
                return GameStage.FEAST
            }

            // Otherwise, it's Day.
            this.days_passed++
            return GameStage.DAY
        }

        this.nights_passed++
        return GameStage.NIGHT
    }

    /** Determine whether the game should end based on how may tributes are alive or whether all should win. */
    #CheckGameShouldEnd() {
        if (this.tributes_alive.length < 2 || this.all_won) {
            this.#state = GameState.END_RESULTS
            return true
        }

        return false
    }

    /** Perform the next round and advance the game state. */
    #DoRound() {
        this.stage = this.#AdvanceGameStage()
        this.#DoRoundImpl()

        // Check if the game should end; if not, move to display the results
        // of this round if it was night.
        if (!this.#CheckGameShouldEnd() && this.stage == GameStage.NIGHT)
            this.#state = GameState.THE_FALLEN
    }

    /**
     * Perform the next round.
     *
     * This keeps choosing events randomly until all characters
     * have acted in an event.
     */
    #DoRoundImpl() {
        // Get the number of tributes.
        let tributes_left = this.tributes_alive.length
        let tributes_alive = tributes_left
        let current_tribute = 0

        // Determine the current round title.
        if (this.stage === GameStage.DAY) this.#game_title = `Day ${this.days_passed}`
        else if (this.stage === GameStage.NIGHT) this.#game_title = `Night ${this.nights_passed}`
        else this.#game_title = TitleCase(this.stage)

        // Create the round.
        let round: GameRound = {
            game_events: [],
            died_this_round: [],
            index: this.rounds.length,
            stage: this.stage
        }

        // Save it to the list of rounds.
        this.rounds.push(round)

        // Shuffle the tributes to randomise the encounters.
        shuffle(this.tributes_alive)

        // Get the event list for the current stage.
        let event_list: Event[]
        switch (this.stage) {
            case GameStage.BLOODBATH: event_list = this.event_list.bloodbath; break
            case GameStage.DAY: event_list = this.event_list.day; break
            case GameStage.NIGHT: event_list = this.event_list.night; break
            case GameStage.FEAST: event_list = this.event_list.feast; break
            default: throw Error(`Invalid game stage '${this.stage}'`)
        }

        // If the list contains no events, then there's nothing to do.
        if (!event_list.length) return
        let died_this_round = 0

        // Randomly pick an event from the corresponding event list
        // whose number of tributes involved does not exceed the number
        // of tributes left. Ensure that every tribute is only picked once.
        // Repeat until no tributes are left.
        outer: while (tributes_left) {
            let tributes_involved: Tribute[] = []
            let event: Event

            // Choose an event at random. Make sure we don't fall into an infinite loop.
            let tries = 0
            do {
                if (tries++ > Math.max(100, event_list.length * 10)) break outer
                event = event_list[randomInt(0, event_list.length)]
            } while (!this.#RequirementsSatisfied(event, current_tribute, tributes_left, died_this_round))
            tributes_left -= event.players_involved

            // Handle fatalities.
            for (const f of event.fatalities) {
                this.tributes_alive[current_tribute + f].died_in_round = round;
                round.died_this_round.push(this.tributes_alive[current_tribute + f])
                tributes_alive--
                died_this_round++
            }

            // Credit killers.
            for (const k of event.killers) this.tributes_alive[current_tribute + k].kills += event.fatalities.length

            // Add all players affected to the event.
            let last = current_tribute + event.players_involved
            for (; current_tribute < last; current_tribute++) tributes_involved.push(this.tributes_alive[current_tribute])

            // And register the event.
            round.game_events.push(new GameEvent(event, tributes_involved))

            // Finally, if only one person is left, they’re the winner (and if no
            // one is alive anymore, there is no winner).
            if (tributes_alive < 2) break
        }

        // If the user set a fixed number of deaths to happen each round, then all
        // of them will be at the start of the list since we first ensure that we
        // have the required amount. That’s fine, but we should shuffle them after
        // the fact so all the deaths don’t end up displayed at the top since that
        // can make things a bit anticlimactic.
        shuffle(round.game_events)

        // Remove any tributes that are now dead from the alive list.
        this.tributes_alive = this.tributes_alive.filter(t => t.died_in_round === undefined)

        // And add them to the list of all tributes that have died since we last
        // displayed deaths.
        this.#tributes_died.push(...round.died_this_round)
    }

    /**
     * Check requirements for an event.
     *
     * There are several restrictions as to what events we can use
     * at any given point in time.
     */
    #RequirementsSatisfied(
        event: Event,
        current_tribute: number,
        tributes_left: number,
        died_this_round: number
    ): boolean {
        // An event must not involve more players than are left.
        if (event.players_involved > tributes_left) return false

        // If there is a required number of fatalities, we want to drive
        // the number of fatalities higher. If we’ve already achieved the
        // required number of fatalities, we don’t want any more fatalities.
        if (this.required_fatalities) {
            if (died_this_round < this.required_fatalities && !event.fatalities.length) return false
            if (died_this_round >= this.required_fatalities && event.fatalities.length) return false
        }

        // Otherwise, if an event has fatalities, we might want to do the opposite and
        // reroll it depending on the fatality_reroll_rate and whether we’ve already
        // achieved the required number of fatalities.
        else if (event.fatalities.length && Math.random() < this.fatality_reroll_rate) return false

        // If an event has tag requirements, it can only be chosen if the players fit those requirements.
        for (const {tag, player_index} of event.requirements)
            if (!this.tributes_alive[current_tribute + player_index].has(tag))
                return false;

        // Otherwise this event is fine.
        return true;
    }

    /** Start a new round. */
    #StartNewRound() {
        this.#tributes_died = []
    }

    /** Set and determine the current render state. */
    #TickRenderState(): RenderState {
        switch (this.#state) {
            case GameState.NEW_ROUND:
            case GameState.IN_ROUND:
                return RenderState.ROUND_EVENTS

            case GameState.THE_FALLEN:
            case GameState.END_RESULTS:
                return RenderState.ROUND_DEATHS

            case GameState.END_WINNER:
                return RenderState.WINNERS

            case GameState.END_SUMMARY_FATALITIES:
                return RenderState.GAME_DEATHS

            case GameState.END_SUMMARY_STATS:
                return RenderState.STATS

            case GameState.DEAD:
            case GameState.END:
                return RenderState.GAME_OVER
        }
    }

    /** Step the game by a round. */
    AdvanceGame(): GameRenderState | Error {
        return Game.#Try(() => this.#AdvanceGame())
    }

    /**
     * Convert tributes on the character select screen to the in-game tributes.
     *
     * @return An array of tributes or an error if the conversion failed.
     */
    static CreateTributesFromCharacterSelectOptions(
        options: TributeCharacterSelectOptions[]
    ): Tribute[] | Error {
        return Game.#Try(() => options.map((character) => {
            if (character.name === '') throw Error('Character name must not be empty!')
            const pronouns = ParsePronounsFromCharacterCreation(character)
            return new Tribute(character.name, {
                pronouns: pronouns.pronouns,
                uses_pronouns: pronouns.uses_pronouns,
                plural: pronouns.plural,
                image: character.image_url ?? '',
                tags: []
            })
        }))
    }

    static #Try<T>(func: () => T): T | Error {
        try { return func() }
        catch (e) { return e as Error }
    }


    /**!!IMPORTANT!! */
    // This was already included, dunno if its a scrapped worse way or unimplimented feature.
/*    static events() {
        return {
            * [Symbol.iterator](): Iterator<Event> {
                for (let event_list_name of Object.keys(Game.event_lists))
                    // @ts-ignore
                    for (let event of Game.event_lists[event_list_name] as Event[])
                        yield event
            }
        }
    }*/
}