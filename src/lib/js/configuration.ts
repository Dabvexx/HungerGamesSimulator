import { Event } from "./events"
import { Tag } from "./tag"
import { PronounSetting, type TributeCharacterSelectOptions } from "./tribute"
import { ArraysEqual } from "./utils"
import { BuiltinDefaultConfig } from "./gameOptions"
import { type EventList } from "./types"

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
        Load(into, BuiltinDefaultConfig, true)
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
}