import { Tag } from "./tag"
import { NameSpan } from "./eventMessage" //Maybe make a type or settings file for stuff like this.
import { type GameRound } from "./types"
import { UserError } from "./dialog.svelte"

export const enum PronounSetting {
    Masculine = "m",
    Feminine = "f",
    Common = "c",
    None = "n",
    Custom = "other",
}

/** Tribute data on the character select screen.. */
export interface TributeCharacterSelectOptions {
    name: string
    custom_pronouns?: string
    pronoun_option: PronounSetting
    image_url?: string
}

/** The options passed to the `Tribute` constructor. */
export interface TributeOptions {
    uses_pronouns: boolean
    pronouns?: TributePronouns
    plural: boolean
    image: string
    tags?: Tag[]
}

/** The N/A/G/R pronouns used by a tribute. */
export interface TributePronouns {
    nominative: string
    accusative: string
    genitive: string
    reflexive: string
}

/** Processed pronouns. */
export interface ParsedPronouns {
    pronouns?: TributePronouns
    uses_pronouns: boolean
    plural: boolean
}

/** A tribute in game or on the character selection screen. */
export class Tribute {
    readonly raw_name: string
    readonly name: NameSpan
    readonly pronouns?: TributePronouns
    readonly uses_pronouns: boolean
    readonly image_src: string
    readonly plural: boolean
    kills: number
    died_in_round: GameRound | undefined
    __tags: Tag[]

    constructor(name: string, options: TributeOptions) {
        this.raw_name = name
        this.name = new NameSpan(name)
        this.uses_pronouns = options.uses_pronouns ?? true
        if (this.uses_pronouns) this.pronouns = {...options.pronouns!!}
        this.image_src = options.image ?? ''
        this.plural = options.plural ?? false
        this.kills = 0
        this.__tags = []
        if (options.tags) this.__tags.push(...options.tags)
    }

    /** Check whether this tribute has a given tag. */
    has(t: Tag): boolean {
        for (const tag of this.__tags)
            if (Tag.equal(tag, t))
                return true
        return false
    }

    /** Add a tag to this tribute. */
    tag(t: Tag): void { if (!this.has(t)) this.__tags.push(t) }
}

/**
 * Parse a pronoun string into a TributePronouns object.
 * @throw UserError if the string is invalid.
 */
export function ParsePronounsFromCharacterCreation(character: TributeCharacterSelectOptions): ParsedPronouns {
    let plural = false
    let uses_pronouns = true
    let tribute_pronouns: TributePronouns | undefined = undefined
    let pronoun_str
    switch (character.pronoun_option) {
        case PronounSetting.Masculine:
            pronoun_str = 'he/him/his/himself'
            break
        case PronounSetting.Feminine:
            pronoun_str = 'she/her/her/herself'
            break
        case PronounSetting.Common:
            pronoun_str = 'they/them/their/themself'
            plural = true
            break
        case PronounSetting.None:
            return { plural: false, uses_pronouns: false }
        case PronounSetting.Custom:
            pronoun_str = character.custom_pronouns ?? ''
            pronoun_str = pronoun_str.split('//').join('\x1f')
            if (!pronoun_str.match(/.+\/.+\/.+\/.+/)) throw new UserError('Custom pronouns must be of the form \'nom/acc/gen/reflx\'\nExample: \'they/them/their/themself\'.')
            break
        default:
            throw new UserError('Game character pronoun selection has invalid state');
    }

    let pronouns: string[] = pronoun_str!!.split('/').map(x => x.split('\x1f').join('//').trim())
    if (pronouns.includes('')) throw new UserError('Custom pronouns may not be empty!\nYou have to specify at least one non-whitespace character for each pronoun.')
    tribute_pronouns = {
        nominative: pronouns[0],
        accusative: pronouns[1],
        genitive: pronouns[2],
        reflexive: pronouns[3]
    }

    return {pronouns: tribute_pronouns, uses_pronouns, plural}
}