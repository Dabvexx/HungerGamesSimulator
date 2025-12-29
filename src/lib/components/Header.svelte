<script lang="ts">
    import agma_logo from '$lib/images/agma_logo.png';
    import type {LanguagePage} from "$lib/js/types.d";
    import PageLink from '$lib/components/header/PageLink.svelte';
    import Hamburger from '$lib/components/header/Hamburger.svelte';
    import {MediaQuery} from 'svelte/reactivity';
    import {browser} from '$app/environment';
    import {afterNavigate} from '$app/navigation';

    interface Props {
        langs: readonly LanguagePage[];
    }

    let { langs }: Props = $props();
    let in_ung_page = $state(false)
    const mobile = new MediaQuery('max-width: 900px');
    const laptop = new MediaQuery('(max-width: 1250px) and (min-width: 900px)');
    afterNavigate(() => { in_ung_page = browser ? window.location.pathname.startsWith('/ung') : false })
</script>

{#snippet Tools()}
    <PageLink href='/tools/hunger_games_simulator'>Hunger Games Simulator</PageLink>
{/snippet}

{#snippet Extra()}

{/snippet}

<header class='fixed top-0 w-full [z-index:10000] flex select-none {mobile.current ? "" : "justify-between"}'>
    <nav>
        <Hamburger {mobile}>
            {#if in_ung_page}
                <PageLink href='/ung'>UŊ</PageLink>
            {/if}

            <PageLink
                href="/tools/hunger_games_simulator"
                class="hg-link"
            >
                Hunger Games Simulator
            </PageLink>
        </Hamburger>
    </nav>
</header>

<style lang='scss'>
    header {
        --nav-fg: var(--accentmedium);
        --nav-bg: var(--accentblack);
        --nav-link-min-wd: 8.5rem;
        --nav-a-padding-left: .5rem;
        height: var(--header-height);
        background: var(--nav-bg);
    }

    :global(.header-bg-transition) {
        transition: background .5s, color .5s;
        &:hover { background: white; }
    }

    @media (max-width: 900px) {
        nav {
            --nav-link-min-wd: 100%;
        }
    }

    .hg-link {
    white-space: nowrap;
    min-width: max-content;
    margin-right: 200rem; 
}
</style>
