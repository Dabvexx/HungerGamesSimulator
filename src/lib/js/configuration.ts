import { Event } from "./events"
import { Tag } from "./tag"
import { PronounSetting, type TributeCharacterSelectOptions } from "./tribute"
import { ArraysEqual } from "./utils"
import { type EventList } from "./types"
import { Persist } from "./persist.svelte"

export namespace Configuration {
    interface MaybeConfig {version?: number}
    interface StoredURL {url: string}
    interface StoredBlob {data: string}

    /** Legacy (unversioned) configuration. */
    namespace Legacy {
        /** An event in a legacy config file. */
        export interface StoredEvent {
            message: string,
            players_involved: number,
            fatalities: number[],
            killers: number[],
            enabled: boolean,
            id: number,
            type: string
        }

        /** The options passed to the `Tribute` constructor. */
        interface StoredTributeOptions {
            name: string
            gender_select: string
            custom_pronouns: string
            image?: string
        }

        export type CharacterConfig = { characters: StoredTributeOptions[] }

        export type Config = EventList<StoredEvent>

        /** Check whether a configuration is a legacy configuration. */
        export function is(conf: any): conf is Config {
            return !conf || !('version' in conf)
        }

        /** Check whether a configuration is a legacy character configuration. */
        export function IsCharacterConfig(conf: any): conf is CharacterConfig {
            return !conf || !('version' in conf)
        }

        /** Check whether two events are to be considered equal */
        export function EventsEqual(stored: StoredEvent, event: Event) {
            return stored && event && stored.message === event.message
        }

        /** Load an event from StoredEvent. */
        export function LoadEvent(stored: StoredEvent, list: Event[]) {
            let event = new Event(stored.message, stored.fatalities, stored.killers, stored.type)
            event.enabled = stored.enabled
            list.push(event)
        }

        /**
         * Load characters from a file.
         *
         * This function is only async because it is async in later config versions.
         **/
        export async function LoadCharacters(data: CharacterConfig): Promise<TributeCharacterSelectOptions[]> {
            return data.characters.map(({ name, custom_pronouns, gender_select, image }) => {
                // Load the image from a URL if it’s not a blob. Old versions of the simulator
                // would produce URLs ending in ‘[object%20Object]’ for some reason. Ignore those.
                let image_url: string | undefined = undefined
                if (
                    typeof image === 'string' &&
                    !image.startsWith('blob:') &&
                    !image.endsWith('[object%20Object]')
                ) image_url = image

                return {
                    name,
                    custom_pronouns,
                    pronoun_option: gender_select as PronounSetting,
                    image_url
                }
            })
        }
    } // namespace Legacy

    /** Configuration version 1. */
    export namespace V1 {
        /** Tag info as stored in a config file. */
        export interface StoredTag {name: string}
        export interface StoredTagRequirement {
            name: string,
            player_index: number
        }

        /** An event in a V1 config file. */
        export interface StoredEvent {
            message: string,
            fatalities: number[],
            killers: number[],
            enabled: boolean,
            type: string,
            tag_requirements: StoredTagRequirement[]
        }

        export interface Config {
            readonly version: 1
            events: EventList<StoredEvent>
            tags: StoredTag[]
        }

        export type StoredTributeImage = StoredURL | StoredBlob
        export interface StoredTributeOptions {
            name: string
            gender_select: string
            pronoun_str: string
            image?: StoredTributeImage
            tags: Tag[]
        }

        export interface CharacterConfig {
            readonly version: 1
            characters: StoredTributeOptions[]
        }

        export const enum StoredEventTag {
            BigLang = 'BIG LANG',
            Custom = 'CUSTOM',
        }

        /** Check whether a configuration is a legacy configuration. */
        export function is(conf: any): conf is Config {
            return conf && conf.version === 1
        }

        /** Check whether a configuration is a legacy character configuration. */
        export function IsCharacterConfig(conf: any): conf is CharacterConfig {
            return conf && conf.version === 1
        }

        /** Check whether two events are to be considered equal */
        export function EventsEqual(stored: StoredEvent, event: Event) {
            return stored !== null && event !== null
                && stored.message === event.message
                && ArraysEqual(stored.tag_requirements, event.requirements,
                    (s, e) => s.name === e.tag.name && s.player_index === e.player_index)
        }

        /** Load an event from StoredEvent. */
        export function LoadEvent(stored: StoredEvent, list: Event[]) {
            let event = new Event(stored.message, stored.fatalities, stored.killers, stored.type)
            event.enabled = stored.enabled && stored.type !== StoredEventTag.BigLang
            stored.tag_requirements.forEach(t => event.require(Tag.for(t.name), t.player_index))
            list.push(event)
        }

        /** Load a tag from a TagInfo struct */
        export function LoadTag(data: StoredTag) { Tag.for(data.name) }

        /** Stringify a tag for the purpose of storing and loading it. */
        export function StringifyTag() {
            // @ts-ignore
            const info: StoredTag = {name: this.__name}
            return JSON.stringify(info, null, 4)
        }

        /** Check whether a tag already exists.
         *
         * In V1, tags consist of only a name and nothing else. Since
         * LoadTag() calls Tag.for(), which already checks whether a tag
         * already exists, this function can just return true.
         */
        export function TagExists(_: StoredTag) { return true }

        /** Load characters from a file. **/
        export async function LoadCharacters(data: CharacterConfig): Promise<TributeCharacterSelectOptions[]> {
            return await Promise.all(data.characters.map(async ({ name, gender_select, pronoun_str, image }) => {
                let image_url: string | undefined = undefined
                if (typeof image === 'object') {
                    // Image is a URL.
                    if ('url' in image) {
                        // Can’t load blob URLs, so don’t try. Old versions of the simulator would also
                        // produce URLs ending in ‘[object%20Object]’ for some reason. Ignore those.
                        if (!image.url.startsWith('blob:') && !image.url.endsWith('[object%20Object]'))
                            image_url = image.url
                    }

                    // Image is a base-64 encoded data URL.
                    else {
                        const blob = await fetch(image.data).then(r => r.blob())
                        image_url = URL.createObjectURL(blob)
                    }
                }

                return {
                    name,
                    custom_pronouns: pronoun_str,
                    pronoun_option: gender_select as PronounSetting,
                    image_url
                }
            }))
        }
    } /// namespace V1

    type EventComparator<T> = (t: T, e: Event) => boolean
    type EventLoader<T> = (t: T, e: Event[]) => void
    type TagExistsP<T> = (t: T) => boolean
    type TagLoader<T> = (t: T) => void

    export const current_config_version = 1

    /** Check if an event exists */
    function EventExists<T>(
        into_list: Event[],
        conf_event: T,
        equal: EventComparator<T>
    ): boolean {
        for (const event of into_list)
            if (equal(conf_event, event))
                return true;
        return false;
    }

    /** Load the events from the configuration. */
    function LoadEvents<T>(
        into: EventList,
        lists: EventList<T>,
        equal: EventComparator<T>,
        loader: EventLoader<T>
    ) {
        for (const key of Event.list_keys) {
            into[key] ??= []
            lists[key]?.filter(e => !EventExists(into[key]!!, e, equal))
                     ?.forEach(e => loader(e, into[key]!!))
        }
    }

    function LoadTags<T>(tags: T[], exists: TagExistsP<T>, loader: TagLoader<T>) {
        tags.filter(t => !exists(t))
            .forEach(t => loader(t))
    }

    /** Load a configuration. */
    export function Load(
        into: EventList,
        configuration: MaybeConfig,
        overwrite: boolean = false,
        from_local_storage = false
    ) {
        // Legacy file format.
        if (Legacy.is(configuration)) {
            if (overwrite)
                for (const key of Event.list_keys)
                    into[key] = []
            return LoadEvents(into, configuration, Legacy.EventsEqual, Legacy.LoadEvent)
        }

        // Versioned file format.
        else if (V1.is(configuration)) {
            if (overwrite) {
                for (const key of Event.list_keys) into[key] = []
                Tag.registered_tags = []
            }

            LoadTags(configuration.tags, V1.TagExists, V1.LoadTag)
            LoadEvents(into, configuration.events, V1.EventsEqual, V1.LoadEvent)
        }

        // Invalid Configuration. If we're loading from localStorage, just ignore it.
        else if (!from_local_storage) throw Error(`Invalid config version ${configuration.version}`)
    }

    /**
     * Load the default configuration.
     *
     * This should never throw; if it does, there is something horribly wrong
     * with the default configuration below.
     */
    export function LoadDefaultConfig(): EventList {
        const into = {}
        Load(into, GameOptions.BuiltinDefaultConfig, true)
        return into
    }

    /** Create an object containing the events data to store. */
    function SaveEvents(event_list: EventList): EventList<V1.StoredEvent> {
        let lists = {
            all: [] as V1.StoredEvent[],
            bloodbath: [] as V1.StoredEvent[],
            day: [] as V1.StoredEvent[],
            feast: [] as V1.StoredEvent[],
            night: [] as V1.StoredEvent[],
        } satisfies EventList<V1.StoredEvent>

        for (const key of Event.list_keys) {
            const list = event_list[key] as Event[]
            const stored_list = lists[key]
            for (const e of list) {
                // Copy the event data.
                let stored_event: V1.StoredEvent = {
                    message: e.message,
                    fatalities: e.fatalities,
                    killers: e.killers,
                    enabled: e.enabled,
                    type: e.type,
                    tag_requirements: []
                }

                // Store the requirements.
                for (const req of e.requirements)
                    stored_event.tag_requirements.push({player_index: req.player_index, name: req.tag.name})

                // Add the events to the lists to store.
                stored_list.push(stored_event)
            }
        }

        return lists
    }

    /** Create an object containing the tag data to store. */
    function SaveTags(): V1.StoredTag[] {
        let tags: V1.StoredTag[] = []
        for (const tag of Tag.registered_tags) tags.push({name: tag.name})
        return tags
    }

    /** Save the configuration. */
    export function Save(event_list: EventList): V1.Config {
        return {
            version: current_config_version,
            events: SaveEvents(event_list),
            tags: SaveTags()
        }
    }

    /** Like the Event constructor, but creates a stored event instead. */
    export function MakeStoredEvent(
        message: string,
        fatalities: number[] = [],
        killers: number[] = [],
        type: string = "BUILTIN",
        reqs: V1.StoredTagRequirement[] = []
    ): V1.StoredEvent {
        return {
            message,
            fatalities,
            killers,
            type,
            enabled: true,
            tag_requirements: reqs
        }
    }

    /**
     * Save characters to a serialised list.
     *
     * @throws Error if we can’t serialise a character.
     **/
    export async function SerialiseCharacters(tributes: TributeCharacterSelectOptions[]): Promise<V1.StoredTributeOptions[]> {
        return Promise.all(tributes.map(async ({name, custom_pronouns, pronoun_option, image_url}) => {
            // Image.
            let image: V1.StoredTributeImage | undefined = undefined

            // Image is a blob. Base-64 encode it.
            if (image_url?.startsWith('blob:')) {
                const blob = await fetch(image_url).then(r => r.blob())
                const reader = new FileReader()
                reader.readAsDataURL(blob)
                image = {data: await new Promise<string>(resolve => reader.onloadend = () => resolve(reader.result as string))}
            }

            // Image is a URL.
            else if (image_url && image_url !== '') image = {url: image_url}

            // Save the character.
            return {
                name,
                gender_select: pronoun_option,
                pronoun_str: custom_pronouns ?? '',
                image: image,
                tags: [],
            }
        }))
    }

    /**
     * Save characters to a file.
     *
     * @throws Error if we can’t serialise a character.
     **/
    export async function SaveCharacters(tributes: TributeCharacterSelectOptions[]): Promise<V1.CharacterConfig> {
        return {
            version: current_config_version,
            characters: await SerialiseCharacters(tributes)
        }
    }

    /** Load characters from a file. **/
    export async function LoadCharacters(data: object): Promise<TributeCharacterSelectOptions[]> {
        if (Legacy.IsCharacterConfig(data)) return await Legacy.LoadCharacters(data);
        else if (V1.IsCharacterConfig(data)) return await V1.LoadCharacters(data);
        else throw Error(`Invalid character configuration file`)
    }

    /** Default event list. */
    export const BuiltinEventList: EventList<V1.StoredEvent> = Object.freeze({
        bloodbath: [
            Configuration.MakeStoredEvent(`%0 runs away from the Cornucopia.`),
            Configuration.MakeStoredEvent(`%0 grabs a shovel.`),
            Configuration.MakeStoredEvent(`%0 grabs a backpack and retreats.`),
            Configuration.MakeStoredEvent(`%0 and %1 fight for a bag. %0 gives up and retreats.`),
            Configuration.MakeStoredEvent(`%0 and %1 fight for a bag. %1 gives up and retreats.`),
            Configuration.MakeStoredEvent(`%0 finds a bow, some arrows, and a quiver.`),
            Configuration.MakeStoredEvent(`%0 runs into the cornucopia and hides.`),
            Configuration.MakeStoredEvent(`%0 finds a canteen full of water.`),
            Configuration.MakeStoredEvent(`%0 stays at the cornucopia for resources.`),
            Configuration.MakeStoredEvent(`%0 gathers as much food as %N0 can.`),
            Configuration.MakeStoredEvent(`%0 grabs a sword.`),
            Configuration.MakeStoredEvent(`%0 takes a spear from inside the cornucopia.`),
            Configuration.MakeStoredEvent(`%0 finds a bag full of explosives.`),
            Configuration.MakeStoredEvent(`%0 clutches a first aid kit and runs away.`),
            Configuration.MakeStoredEvent(`%0 takes a sickle from inside the cornucopia.`),
            Configuration.MakeStoredEvent(`%0, %1, and %2 work together to get as many supplies as possible.`),
            Configuration.MakeStoredEvent(`%0 runs away with a lighter and some rope.`),
            Configuration.MakeStoredEvent(`%0 snatches a bottle of alcohol and a rag.`),
            Configuration.MakeStoredEvent(`%0 finds a backpack full of camping equipment.`),
            Configuration.MakeStoredEvent(`%0 grabs a backpack, not realizing it is empty.`),
            Configuration.MakeStoredEvent(`%0 breaks %1's nose for a basket of bread.`),
            Configuration.MakeStoredEvent(`%0, %1, %2, and %3 share everything they gathered before running.`),
            Configuration.MakeStoredEvent(`%0 retrieves a trident from inside the cornucopia.`),
            Configuration.MakeStoredEvent(`%0 grabs a jar of fishing bait while %1 gets fishing gear.`),
            Configuration.MakeStoredEvent(`%0 scares %1 away from the cornucopia.`),
            Configuration.MakeStoredEvent(`%0 grabs a shield leaning on the cornucopia.`),
            Configuration.MakeStoredEvent(`%0 snatches a pair of sais.`),

            Configuration.MakeStoredEvent(`%0 steps off %G0 podium too soon and blows up.`, [0], []),
            Configuration.MakeStoredEvent(`%0 snaps %1's neck.`, [1], [0]),
            Configuration.MakeStoredEvent(`%0 finds %1 hiding in the cornucopia and kills %A1.`, [1], [0]),
            Configuration.MakeStoredEvent(`%0 finds %1 hiding in the cornucopia, but %1 kills %A0.`, [0], [1]),
            Configuration.MakeStoredEvent(`%0 and %1 fight for a bag. %0 strangles %1 with the straps and runs.`, [1], [0]),
            Configuration.MakeStoredEvent(`%0 and %1 fight for a bag. %1 strangles %0 with the straps and runs.`, [0], [1])
        ],
        day: [
            Configuration.MakeStoredEvent(`%0 goes hunting.`),
            Configuration.MakeStoredEvent(`%0 injures %R0.`),
            Configuration.MakeStoredEvent(`%0 explores the arena.`),
            Configuration.MakeStoredEvent(`%0 scares %1 off.`),
            Configuration.MakeStoredEvent(`%0 diverts %1's attention and runs away.`),
            Configuration.MakeStoredEvent(`%0 stalks %1.`),
            Configuration.MakeStoredEvent(`%0 fishes.`),
            Configuration.MakeStoredEvent(`%0 camouflages %R0 in the bushes.`),
            Configuration.MakeStoredEvent(`%0 steals from %1 while %N1 %!1 looking.`),
            Configuration.MakeStoredEvent(`%0 makes a wooden spear.`),
            Configuration.MakeStoredEvent(`%0 discovers a cave.`),
            Configuration.MakeStoredEvent(`%0 attacks %1, but %N1 manage%s1 to escape.`),
            Configuration.MakeStoredEvent(`%0 chases %1.`),
            Configuration.MakeStoredEvent(`%0 runs away from %1.`),
            Configuration.MakeStoredEvent(`%0 collects fruit from a tree.`),
            Configuration.MakeStoredEvent(`%0 receives a hatchet from an unknown sponsor.`),
            Configuration.MakeStoredEvent(`%0 receives clean water from an unknown sponsor.`),
            Configuration.MakeStoredEvent(`%0 receives medical supplies from an unknown sponsor.`),
            Configuration.MakeStoredEvent(`%0 receives fresh food from an unknown sponsor.`),
            Configuration.MakeStoredEvent(`%0 searches for a water source.`),
            Configuration.MakeStoredEvent(`%0 defeats %1 in a fight, but spares %G1 life.`),
            Configuration.MakeStoredEvent(`%0 and %1 work together for the day.`),
            Configuration.MakeStoredEvent(`%0 begs for %1 to kill %A0. %N1 refuse%s1, keeping %0 alive.`),
            Configuration.MakeStoredEvent(`%0 tries to sleep through the entire day.`),
            Configuration.MakeStoredEvent(`%0, %1, %2, and %3 raid %4's camp while %N4 %i4 hunting.`),
            Configuration.MakeStoredEvent(`%0 constructs a shack.`),
            Configuration.MakeStoredEvent(`%0 overhears %1 and %2 talking in the distance.`),
            Configuration.MakeStoredEvent(`%0 practices %G0 archery.`),
            Configuration.MakeStoredEvent(`%0 thinks about home.`),
            Configuration.MakeStoredEvent(`%0 is pricked by thorns while picking berries.`),
            Configuration.MakeStoredEvent(`%0 tries to spear fish with a trident.`),
            Configuration.MakeStoredEvent(`%0 searches for firewood.`),
            Configuration.MakeStoredEvent(`%0 and %1 split up to search for resources.`),
            Configuration.MakeStoredEvent(`%0 picks flowers.`),
            Configuration.MakeStoredEvent(`%0 tends to %1's wounds.`),
            Configuration.MakeStoredEvent(`%0 sees smoke rising in the distance, but decides not to investigate.`),
            Configuration.MakeStoredEvent(`%0 sprains %G0 ankle while running away from %1.`),
            Configuration.MakeStoredEvent(`%0 makes a slingshot.`),
            Configuration.MakeStoredEvent(`%0 travels to higher ground.`),
            Configuration.MakeStoredEvent(`%0 discovers a river.`),
            Configuration.MakeStoredEvent(`%0 hunts for other tributes.`),
            Configuration.MakeStoredEvent(`%0 and %1 hunt for other tributes.`),
            Configuration.MakeStoredEvent(`%0, %1, and %2 hunt for other tributes.`),
            Configuration.MakeStoredEvent(`%0, %1, %2, and %3 hunt for other tributes.`),
            Configuration.MakeStoredEvent(`%0, %1, %2, %3, and %4 hunt for other tributes.`),
            Configuration.MakeStoredEvent(`%0 receives an explosive from an unknown sponsor.`),
            Configuration.MakeStoredEvent(`%0 questions %G0 sanity.`),

            Configuration.MakeStoredEvent(`%0 kills %1 while %N1 %i1 resting.`, [1], [0]),
            Configuration.MakeStoredEvent(`%0 begs for %1 to kill %A0. %N1 reluctantly oblige%s1, killing %0.`, [0], [1]),
            Configuration.MakeStoredEvent(`%0 bleeds out due to untreated injuries.`, [0], []),
            Configuration.MakeStoredEvent(`%0 unknowingly eats toxic berries.`, [0], []),
            Configuration.MakeStoredEvent(`%0 silently snaps %1's neck.`, [1], [0]),
            Configuration.MakeStoredEvent(`%0 taints %1's food, killing %A1.`, [1], [0]),
            Configuration.MakeStoredEvent(`%0 dies from an infection.`, [0], []),
            Configuration.MakeStoredEvent(`%0's trap kills %1.`, [1], [0]),
            Configuration.MakeStoredEvent(`%0 dies from hypothermia.`, [0], []),
            Configuration.MakeStoredEvent(`%0 dies from hunger.`, [0], []),
            Configuration.MakeStoredEvent(`%0 dies from thirst.`, [0], []),
            Configuration.MakeStoredEvent(`%0 dies trying to escape the arena.`, [0], []),
            Configuration.MakeStoredEvent(`%0 dies of dysentery.`, [0], []),
            Configuration.MakeStoredEvent(`%0 accidentally detonates a land mine while trying to arm it.`, [0], []),
            Configuration.MakeStoredEvent(`%0 ambushes %1 and kills %A1.`, [1], [0]),
            Configuration.MakeStoredEvent(`%0, %1, and %2 successfully ambush and kill %3, %4, and %5.`, [3, 4, 5], [0, 1, 2]),
            Configuration.MakeStoredEvent(`%0, %1, and %2 unsuccessfully ambush %3, %4, and %5, who kill them instead.`, [0, 1, 2], [3, 4, 5]),
            Configuration.MakeStoredEvent(`%0 forces %1 to kill %2 or %3. %N1 decide%s1 to kill %2.`, [2], [1]),
            Configuration.MakeStoredEvent(`%0 forces %1 to kill %2 or %3. %N1 decide%s1 to kill %3.`, [3], [1]),
            Configuration.MakeStoredEvent(`%0 forces %1 to kill %2 or %3. %N1 refuse%s1 to kill, so %0 kills %A1 instead.`, [1], [0]),
            Configuration.MakeStoredEvent(`%0 poisons %1's drink, but mistakes it for %G0 own and dies.`, [0], []),
            Configuration.MakeStoredEvent(`%0 poisons %1's drink. %N1 drink%s1 it and die%s1.`, [1], [0]),
            Configuration.MakeStoredEvent(`%0 attempts to climb a tree, but falls on %1, killing them both.`, [0, 1], []),
            Configuration.MakeStoredEvent(`%0, %1, %2, %3, and %4 track down and kill %5.`, [5], [0, 1, 2, 3, 4]),
            Configuration.MakeStoredEvent(`%0, %1, %2, and %3 track down and kill %4.`, [4], [0, 1, 2, 3]),
            Configuration.MakeStoredEvent(`%0, %1, and %2 track down and kill %3.`, [3], [0, 1, 2]),
            Configuration.MakeStoredEvent(`%0 and %1 track down and kill %2.`, [2], [0, 1]),
            Configuration.MakeStoredEvent(`%0 tracks down and kills %1.`, [1], [0])
        ],
        night: [
            Configuration.MakeStoredEvent(`%0 starts a fire.`),
            Configuration.MakeStoredEvent(`%0 sets up camp for the night.`),
            Configuration.MakeStoredEvent(`%0 loses sight of where %N0 %i0.`),
            Configuration.MakeStoredEvent(`%0 climbs a tree to rest.`),
            Configuration.MakeStoredEvent(`%0 goes to sleep.`),
            Configuration.MakeStoredEvent(`%0 and %1 tell stories about themselves to each other.`),
            Configuration.MakeStoredEvent(`%0, %1, %2, and %3 sleep in shifts.`),
            Configuration.MakeStoredEvent(`%0, %1, and %2 sleep in shifts.`),
            Configuration.MakeStoredEvent(`%0 and %1 sleep in shifts.`),
            Configuration.MakeStoredEvent(`%0 tends to %G0 wounds.`),
            Configuration.MakeStoredEvent(`%0 sees a fire, but stays hidden.`),
            Configuration.MakeStoredEvent(`%0 screams for help.`),
            Configuration.MakeStoredEvent(`%0 stays awake all night.`),
            Configuration.MakeStoredEvent(`%0 passes out from exhaustion.`),
            Configuration.MakeStoredEvent(`%0 cooks %G0 food before putting %G0 fire out.`),
            Configuration.MakeStoredEvent(`%0 and %1 run into each other and decide to truce for the night.`),
            Configuration.MakeStoredEvent(`%0 fends %1, %2, and %3 away from %G0 fire.`),
            Configuration.MakeStoredEvent(`%0, %1, and %2 discuss the games and what might happen in the morning.`),
            Configuration.MakeStoredEvent(`%0 cries %R0 to sleep.`),
            Configuration.MakeStoredEvent(`%0 tries to treat %G0 infection.`),
            Configuration.MakeStoredEvent(`%0 and %1 talk about the tributes still alive.`),
            Configuration.MakeStoredEvent(`%0 is awoken by nightmares.`),
            Configuration.MakeStoredEvent(`%0 and %1 huddle for warmth.`),
            Configuration.MakeStoredEvent(`%0 thinks about winning.`),
            Configuration.MakeStoredEvent(`%0, %1, %2, and %3 tell each other ghost stories to lighten the mood.`),
            Configuration.MakeStoredEvent(`%0 looks at the night sky.`),
            Configuration.MakeStoredEvent(`%0 defeats %1 in a fight, but spares %G1 life.`),
            Configuration.MakeStoredEvent(`%0 begs for %1 to kill %A0. %N1 refuse%s1, keeping %0 alive.`),
            Configuration.MakeStoredEvent(`%0 destroys %1's supplies while %N1 %i1 asleep.`),
            Configuration.MakeStoredEvent(`%0, %1, %2, %3, and %4 sleep in shifts.`),
            Configuration.MakeStoredEvent(`%0 lets %1 into %G0 shelter.`),
            Configuration.MakeStoredEvent(`%0 receives a hatchet from an unknown sponsor.`),
            Configuration.MakeStoredEvent(`%0 receives clean water from an unknown sponsor.`),
            Configuration.MakeStoredEvent(`%0 receives medical supplies from an unknown sponsor.`),
            Configuration.MakeStoredEvent(`%0 receives fresh food from an unknown sponsor.`),
            Configuration.MakeStoredEvent(`%0 tries to sing %R0 to sleep.`),
            Configuration.MakeStoredEvent(`%0 attempts to start a fire, but is unsuccessful.`),
            Configuration.MakeStoredEvent(`%0 thinks about home.`),
            Configuration.MakeStoredEvent(`%0 tends to %1's wounds.`),
            Configuration.MakeStoredEvent(`%0 quietly hums.`),
            Configuration.MakeStoredEvent(`%0, %1, and %2 cheerfully sing songs together.`),
            Configuration.MakeStoredEvent(`%0 is unable to start a fire and sleeps without warmth.`),
            Configuration.MakeStoredEvent(`%0 and %1 hold hands.`),
            Configuration.MakeStoredEvent(`%0 convinces %1 to snuggle with %A0.`),
            Configuration.MakeStoredEvent(`%0 receives an explosive from an unknown sponsor.`),
            Configuration.MakeStoredEvent(`%0 questions %G0 sanity.`),

            Configuration.MakeStoredEvent(`%0 kills %1 while %N1 %i1 sleeping.`, [1], [0]),
            Configuration.MakeStoredEvent(`%0 begs for %1 to kill %A0. %N1 reluctantly oblige%s1, killing %0.`, [0], [1]),
            Configuration.MakeStoredEvent(`%0 bleeds out due to untreated injuries.`, [0], []),
            Configuration.MakeStoredEvent(`%0 unknowingly eats toxic berries.`, [0], []),
            Configuration.MakeStoredEvent(`%0 silently snaps %1's neck.`, [1], [0]),
            Configuration.MakeStoredEvent(`%0 taints %1's food, killing %A1.`, [1], [0]),
            Configuration.MakeStoredEvent(`%0 dies from an infection.`, [0], []),
            Configuration.MakeStoredEvent(`%0's trap kills %1.`, [1], [0]),
            Configuration.MakeStoredEvent(`%0 dies from hypothermia.`, [0], []),
            Configuration.MakeStoredEvent(`%0 dies from hunger.`, [0], []),
            Configuration.MakeStoredEvent(`%0 dies from thirst.`, [0], []),
            Configuration.MakeStoredEvent(`%0 dies trying to escape the arena.`, [0], []),
            Configuration.MakeStoredEvent(`%0 dies of dysentery.`, [0], []),
            Configuration.MakeStoredEvent(`%0 accidentally detonates a land mine while trying to arm it.`, [0], []),
            Configuration.MakeStoredEvent(`%0 ambushes %1 and kills %A1.`, [1], [0]),
            Configuration.MakeStoredEvent(`%0, %1, and %2 successfully ambush and kill %3, %4, and %5.`, [3, 4, 5], [0, 1, 2]),
            Configuration.MakeStoredEvent(`%0, %1, and %2 unsuccessfully ambush %3, %4, and %5, who kill them instead.`, [0, 1, 2], [3, 4, 5]),
            Configuration.MakeStoredEvent(`%0 forces %1 to kill %2 or %3. %N1 decide%s1 to kill %2.`, [2], [1]),
            Configuration.MakeStoredEvent(`%0 forces %1 to kill %2 or %3. %N1 decide%s1 to kill %3.`, [3], [1]),
            Configuration.MakeStoredEvent(`%0 forces %1 to kill %2 or %3. %N1 refuse%s1 to kill, so %0 kills %A1 instead.`, [1], [0]),
            Configuration.MakeStoredEvent(`%0 poisons %1's drink, but mistakes it for %G0 own and dies.`, [0], []),
            Configuration.MakeStoredEvent(`%0 poisons %1's drink. %N1 drink%s1 it and die%s1.`, [1], [0]),
            Configuration.MakeStoredEvent(`%0 attempts to climb a tree, but falls on %1, killing them both.`, [0, 1], []),
            Configuration.MakeStoredEvent(`%0, %1, %2, %3, and %4 track down and kill %5.`, [5], [0, 1, 2, 3, 4]),
            Configuration.MakeStoredEvent(`%0, %1, %2, and %3 track down and kill %4.`, [4], [0, 1, 2, 3]),
            Configuration.MakeStoredEvent(`%0, %1, and %2 track down and kill %3.`, [3], [0, 1, 2]),
            Configuration.MakeStoredEvent(`%0 and %1 track down and kill %2.`, [2], [0, 1]),
            Configuration.MakeStoredEvent(`%0 tracks down and kills %1.`, [1], [0])
        ],
        feast: [
            Configuration.MakeStoredEvent(`%0 gathers as much food into a bag as %N0 can before fleeing.`),
            Configuration.MakeStoredEvent(`%0 sobs while gripping a photo of %G0 friends and family.`),
            Configuration.MakeStoredEvent(`%0 and %1 decide to work together to get more supplies.`),
            Configuration.MakeStoredEvent(`%0 and %1 get into a fight over raw meat, but %1 gives up and runs away.`),
            Configuration.MakeStoredEvent(`%0 and %1 get into a fight over raw meat, but %0 gives up and runs away.`),
            Configuration.MakeStoredEvent(`%0, %1, and %2 confront each other, but grab what they want slowly to avoid conflict.`),
            Configuration.MakeStoredEvent(`%0 destroys %1's memoirs out of spite.`),
            Configuration.MakeStoredEvent(`%0, %1, %2, and %3 team up to grab food, supplies, weapons, and memoirs.`),
            Configuration.MakeStoredEvent(`%0 steals %1's memoirs.`),
            Configuration.MakeStoredEvent(`%0 takes a staff leaning against the cornucopia.`),
            Configuration.MakeStoredEvent(`%0 stuffs a bundle of dry clothing into a backpack before sprinting away.`),

            Configuration.MakeStoredEvent(`%0 bleeds out due to untreated injuries.`, [0], []),
            Configuration.MakeStoredEvent(`%0 snaps %1's neck.`, [1], [0]),
            Configuration.MakeStoredEvent(`%0 dies from an infection.`, [0], []),
            Configuration.MakeStoredEvent(`%0's trap kills %1.`, [1], [0]),
            Configuration.MakeStoredEvent(`%0 ambushes %1 and kills %A1.`, [1], [0]),
            Configuration.MakeStoredEvent(`%0, %1, and %2 successfully ambush and kill %3, %4, and %5.`, [3, 4, 5], [0, 1, 2]),
            Configuration.MakeStoredEvent(`%0, %1, and %2 unsuccessfully ambush %3, %4, and %5, who kill them instead.`, [0, 1, 2], [3, 4, 5]),
            Configuration.MakeStoredEvent(`%0, %1, %2, %3, and %4 track down and kill %5.`, [5], [0, 1, 2, 3, 4]),
            Configuration.MakeStoredEvent(`%0, %1, %2, and %3 track down and kill %4.`, [4], [0, 1, 2, 3]),
            Configuration.MakeStoredEvent(`%0, %1, and %2 track down and kill %3.`, [3], [0, 1, 2]),
            Configuration.MakeStoredEvent(`%0 and %1 track down and kill %2.`, [2], [0, 1]),
            Configuration.MakeStoredEvent(`%0 tracks down and kills %1.`, [1], [0])
        ],
        all: [
            Configuration.MakeStoredEvent(`%0 throws a knife into %1's head.`, [1], [0]),
            Configuration.MakeStoredEvent(`%0 accidentally steps on a landmine.`, [0], []),
            Configuration.MakeStoredEvent(`%0 catches %1 off guard and kills %A1.`, [1], [0]),
            Configuration.MakeStoredEvent(`%0 and %1 work together to drown %2.`, [2], [0, 1]),
            Configuration.MakeStoredEvent(`%0 strangles %1 after engaging in a fist fight.`, [1], [0]),
            Configuration.MakeStoredEvent(`%0 shoots an arrow into %1's head.`, [1], [0]),
            Configuration.MakeStoredEvent(`%0 cannot handle the circumstances and commits suicide.`, [0], []),
            Configuration.MakeStoredEvent(`%0 bashes %1's head against a rock several times.`, [1], [0]),
            Configuration.MakeStoredEvent(`%0 decapitates %1 with a sword.`, [1], [0]),
            Configuration.MakeStoredEvent(`%0 spears %1 in the abdomen.`, [1], [0]),
            Configuration.MakeStoredEvent(`%0 sets %1 on fire with a molotov.`, [1], [0]),
            Configuration.MakeStoredEvent(`%0 falls into a pit and dies.`, [0], []),
            Configuration.MakeStoredEvent(`%0 stabs %1 while %G1 back is turned.`, [1], [0]),
            Configuration.MakeStoredEvent(`%0 severely injures %1, but puts %A1 out of %G1 misery.`, [1], [0]),
            Configuration.MakeStoredEvent(`%0 severely injures %1 and leaves %A1 to die.`, [1], [0]),
            Configuration.MakeStoredEvent(`%0 bashes %1's head in with a mace.`, [1], [0]),
            Configuration.MakeStoredEvent(`%0 pushes %1 off a cliff during a knife fight.`, [1], [0]),
            Configuration.MakeStoredEvent(`%0 throws a knife into %1's chest.`, [1], [0]),
            Configuration.MakeStoredEvent(`%0 is unable to convince %1 to not kill %A0.`, [0], [1]),
            Configuration.MakeStoredEvent(`%0 convinces %1 to not kill %A0, only to kill %A1 instead.`, [1], [0]),
            Configuration.MakeStoredEvent(`%0 falls into a frozen lake and drowns.`, [0], []),
            Configuration.MakeStoredEvent(`%0, %1, and %2 start fighting, but %1 runs away as %0 kills %2.`, [2], [0]),
            Configuration.MakeStoredEvent(`%0 kills %1 with %G1 own weapon.`, [1], [0]),
            Configuration.MakeStoredEvent(`%0 overpowers %1, killing %A1.`, [1], [0]),
            Configuration.MakeStoredEvent(`%0 sets an explosive off, killing %1.`, [1], [0]),
            Configuration.MakeStoredEvent(`%0 sets an explosive off, killing %1, and %2.`, [1, 2], [0]),
            Configuration.MakeStoredEvent(`%0 sets an explosive off, killing %1, %2, and %3.`, [1, 2, 3], [0]),
            Configuration.MakeStoredEvent(`%0 sets an explosive off, killing %1, %2, %3 and %4.`, [1, 2, 3, 4], [0]),
            Configuration.MakeStoredEvent(`%0 kills %1 as %N1 tr%y1 to run.`, [1], [0]),
            Configuration.MakeStoredEvent(`%0 and %1 threaten a double suicide. It fails and they die.`, [0, 1], []),
            Configuration.MakeStoredEvent(`%0, %1, %2, and %3 form a suicide pact, killing themselves.`, [0, 1, 2, 3], []),
            Configuration.MakeStoredEvent(`%0 kills %1 with a hatchet.`, [1], [0]),
            Configuration.MakeStoredEvent(`%0 and %1 fight %2 and %3. %0 and %1 survive.`, [2, 3], [0, 1]),
            Configuration.MakeStoredEvent(`%0 and %1 fight %2 and %3. %2 and %3 survive.`, [0, 1], [2, 3]),
            Configuration.MakeStoredEvent(`%0 attacks %1, but %2 protects %A1, killing %0.`, [0], [2]),
            Configuration.MakeStoredEvent(`%0 severely slices %1 with a sword.`, [1], [0]),
            Configuration.MakeStoredEvent(`%0 strangles %1 with a rope.`, [1], [0]),
            Configuration.MakeStoredEvent(`%0 kills %1 for %G1 supplies.`, [1], [0]),
            Configuration.MakeStoredEvent(`%0 shoots an arrow at %1, but misses and kills %2 instead.`, [2], [0]),
            Configuration.MakeStoredEvent(`%0 shoots a poisonous blow dart into %1's neck, slowly killing %A1.`, [1], [0]),
            Configuration.MakeStoredEvent(`%0 stabs %1 with a tree branch.`, [1], [0]),
            Configuration.MakeStoredEvent(`%0 stabs %1 in the back with a trident.`, [1], [0]),
            Configuration.MakeStoredEvent(`%0, %1, and %2 get into a fight. %0 triumphantly kills them both.`, [1, 2], [0]),
            Configuration.MakeStoredEvent(`%0, %1, and %2 get into a fight. %1 triumphantly kills them both.`, [0, 2], [1]),
            Configuration.MakeStoredEvent(`%0, %1, and %2 get into a fight. %2 triumphantly kills them both.`, [0, 1], [2]),
            Configuration.MakeStoredEvent(`%0 kills %1 with a sickle.`, [1], [0]),
            Configuration.MakeStoredEvent(`%0 repeatedly stabs %1 to death with sais.`, [1], [0]),

            Configuration.MakeStoredEvent(`%0 incorporates %1 as a substrate.`, [1], [0], Configuration.V1.StoredEventTag.BigLang),
            Configuration.MakeStoredEvent(`%0 hunts and eats a pidgin.`, [], [], Configuration.V1.StoredEventTag.BigLang),
            Configuration.MakeStoredEvent(`%0 and %1 form a creole together.`, [], [], Configuration.V1.StoredEventTag.BigLang),
            Configuration.MakeStoredEvent(`%0 harvests a wanderwort.`, [], [], Configuration.V1.StoredEventTag.BigLang),
            Configuration.MakeStoredEvent(`%0 takes a calqueulated risk.`, [], [], Configuration.V1.StoredEventTag.BigLang),
            Configuration.MakeStoredEvent(`%0 and %1 realise they're from the same language family and form an alliance.`, [], [], Configuration.V1.StoredEventTag.BigLang),
            Configuration.MakeStoredEvent(`%0 betrays %1—%0 was a false friend!`, [1], [0], Configuration.V1.StoredEventTag.BigLang),
            Configuration.MakeStoredEvent(`While discussing plans with an ally, %0 accidentally uses an exclusive ‘we’ instead of inclusive, sparking civil war.`, [], [], Configuration.V1.StoredEventTag.BigLang),
            Configuration.MakeStoredEvent(`Trapped in %0’s snare, %1 has to remove one of %G1 cases to escape.`, [], [], Configuration.V1.StoredEventTag.BigLang),
            Configuration.MakeStoredEvent(`%0 is feeling tense.`, [], [], Configuration.V1.StoredEventTag.BigLang),
            Configuration.MakeStoredEvent(`%0 invents pictographic marking to note dangerous parts of the arena.`, [], [], Configuration.V1.StoredEventTag.BigLang),
            Configuration.MakeStoredEvent(`%0 adapts %1’s symbols, and scrawls grave insults to agitate and distract the other competitors.`, [], [], Configuration.V1.StoredEventTag.BigLang),
            Configuration.MakeStoredEvent(`%0 labours under the illusion %N0 %i0 ‘pure’ and goes on a rampage, killing %1 and %2 and forcing all others to flee.`, [1, 2], [0], Configuration.V1.StoredEventTag.BigLang),
            Configuration.MakeStoredEvent(`%0 manages to evolve /tʼ/ into poisonous spit and blinds %1.`, [1], [0], Configuration.V1.StoredEventTag.BigLang),
            Configuration.MakeStoredEvent(`%0 loses some coda consonants in a scrap with %1 but manages to innovate some tones to maintain the distinctiveness between its phonemes.`, [], [], Configuration.V1.StoredEventTag.BigLang),
            Configuration.MakeStoredEvent(`%0 undergoes flagrant mergers, resulting in widespread homophony. %N0 then make%s0 many puns, resulting in %1 and %2 ambushing and killing %A0.`, [0], [1, 2], Configuration.V1.StoredEventTag.BigLang),
            Configuration.MakeStoredEvent(`Following %0 and %1’s alliance, they grow closer and undergo ‘cultural synthesis’. They enjoy the experience, and though they then part ways, they leave an everlasting impression on one another.`, [], [], Configuration.V1.StoredEventTag.BigLang),
            Configuration.MakeStoredEvent(`Fed up with %0 insisting %N0 %i0 the \"mother of all languages,\" %1 and %2 brutally strangle %A0 and bond over the experience.`, [0], [1, 2], Configuration.V1.StoredEventTag.BigLang),
            Configuration.MakeStoredEvent(`%0 gets sick and can now only produce nasal vowels.`, [], [], Configuration.V1.StoredEventTag.BigLang)
        ]
    })

    export namespace GameOptions {
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
/*             events: Object.freeze({
                bloodbath: [],
                day: [],
                night: [],
                feast:[],
                all: []
            }), */
            events: BuiltinEventList,
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
    }
}