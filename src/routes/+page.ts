// Prerender everything that we can prerender.
export const prerender = true;

import { redirect } from '@sveltejs/kit';

export function load() {
    redirect(307, '/tools/hunger_games_simulator');
}