import type { GameEvent } from "./types"
import { char_zero, isdigit } from "./utils"

export class NameSpan {
    readonly value: string
    constructor(value: string) { this.value = value }
}

/**
 * Formatted message parts.
 *
 * The reason this is a thing is to be able to both highlight player names in
 * the message while also preventing HTML injection.
 */
export type FormattedMessage = (string | NameSpan)[]

/**
 * Generate a message describing an event based on the event's message
 * template and the tributes involved.
 *
 * @param event A `GameEvent` (NOT `Event`) for which we want to construct the message.
 * @throw Error if the message template is ill-formed.
 * @return The formatted event message.
 */
export function ComposeEventMessage(event: GameEvent): FormattedMessage {
    // Determine whether there is a tribute w/ index `index`.
    function check_bounds(event: GameEvent, index: number) {
        if (index >= event.event.players_involved) throw Error(`
            Index out of bounds.
            Cannot substitute player \'${index}\' in event \'${event.event.message}\' 
            since it only involves ${event.event.players_involved} 
            player${event.event.players_involved > 1 ? 's' : ''}.
            Keep in mind that the first player's formatting code is '%0', not '%1'!
        `)
    }

    let m = event.event.message
    let composed = []
    let prev = 0, i = 0
    outer:
        for (; ;) {
            while (i < m.length && m[i] !== '%') i++
            composed.push(m.slice(prev, i))
            prev = i
            if (i >= m.length) break
            i++ /// yeet %
            if (i >= m.length) break

            switch (m[i]) {
                case '0':
                case '1':
                case '2':
                case '3':
                case '4':
                case '5':
                case '6':
                case '7':
                case '8':
                case '9': {
                    check_bounds(event, m[i].charCodeAt(0) - char_zero)
                    let name = event.players_involved[m[i].charCodeAt(0) - char_zero].name
                    composed.push(name)

                    i++
                    if (i >= m.length) break outer; /// yeet %
                    break;
                }
                case 'N':
                case 'A':
                case 'G':
                case 'R':
                case 's':
                case 'y':
                case 'i':
                case 'h':
                case 'e':
                case '!':
                case 'w': {
                    let c = m[i++];
                    if (isdigit(m[i])) {
                        let index = m[i].charCodeAt(0) - char_zero
                        let text: string
                        check_bounds(event, index)
                        let tribute = event.players_involved[index]
                        switch (c) {
                            // Pronouns
                            case 'N': text = tribute.uses_pronouns ? tribute?.pronouns?.nominative!! : tribute.raw_name; break
                            case 'A': text = tribute.uses_pronouns ? tribute?.pronouns?.accusative!! : tribute.raw_name; break
                            case 'G': text = tribute.uses_pronouns ? tribute?.pronouns?.genitive!! : tribute.raw_name + '’s'; break
                            case 'R': text = tribute.uses_pronouns ? tribute?.pronouns?.reflexive!! : tribute.raw_name; break

                            // Singular/plural specifiers.
                            case 'e': text = tribute.plural ? '' : 'es'; break            // 3SG        / -es
                            case 's': text = tribute.plural ? '' : 's'; break             // 3SG        / -s
                            case 'y': text = tribute.plural ? 'y' : 'ies'; break          // 3SG -y     / -ies
                            case 'i': text = tribute.plural ? 'are' : 'is'; break         // 3SG are    / is
                            case 'h': text = tribute.plural ? 'have' : 'has'; break       // 3SG have   / has
                            case '!': text = tribute.plural ? 'aren\'t' : 'isn\'t'; break // 3SG aren't / isn't
                            case 'w': text = tribute.plural ? 'were' : 'was'; break       // 3SG were   / was
                            default: continue
                        }
                        composed.push(text)
                        i++
                    } else continue;
                    break;
                }
                default:
                    continue;
            }
            prev = i;
        }
    if (prev < m.length) composed.push(m.slice(prev))
    return composed
}