---
title: "Vue3 Frontend Check Patterns"
version: "1.0"
updated: 2026-08-11
---

# Vue3 Static Scan Rules — Tier A

Rules applied by `scanVueTemplate()` in `src/frontend-check.ts`.
Each rule has: id, regex pattern, severity, WCAG reference, description, examples, and false-positive filters.

## Accessibility (WCAG)

### vue-a11y-click-non-button

- **pattern**: `<(div|span|p|section|article)[^>]*@click`
- **severity**: P1
- **wcag**: "2.1.1 Keyboard"
- **description**: "Non-semantic element with @click but missing role/tabindex"
- **example_bad**: `<div @click="handle">click</div>`
- **example_good**: `<button @click="handle">click</button>`
- **false_positive_filter**: `["role=\"button\"", "role=\"link\"", "tabindex="]`

### vue-a11y-img-missing-alt

- **pattern**: `<img[^>]*(?!alt=)[^>]*>`
- **severity**: P1
- **wcag**: "1.1.1 Non-text Content"
- **description**: "img element missing alt attribute"
- **example_bad**: `<img src="logo.png">`
- **example_good**: `<img src="logo.png" alt="Company logo">`
- **false_positive_filter**: `["alt=\"\""]`

### vue-a11y-missing-lang

- **pattern**: `<html(?![^>]*\\slang=)[^>]*>`
- **severity**: P2
- **wcag**: "3.1.1 Language of Page"
- **description**: "html element missing lang attribute"
- **example_bad**: `<html>`
- **example_good**: `<html lang="en">`
- **false_positive_filter**: `[]`

### vue-a11y-aria-hidden-focusable

- **pattern**: `aria-hidden="true"[^>]*>([^<]*<(?:a|button|input|select|textarea)[^>]*>|[^<]*@click)`
- **severity**: P1
- **wcag**: "4.1.2 Name, Role, Value"
- **description**: "Focusable element inside aria-hidden container"
- **example_bad**: `<div aria-hidden="true"><button>hidden</button></div>`
- **example_good**: `<div aria-hidden="true"><span>decorative</span></div>`
- **false_positive_filter**: `["tabindex=\"-1\""]`

## Router

### vue-router-missing-redirect

- **pattern**: `path:\s*['\"][^'\"]*['\"],?\s*$`
- **severity**: P2
- **wcag**: "N/A"
- **description**: "Route path without component, redirect, or children"
- **example_bad**: `{ path: '/old-page' }`
- **example_good**: `{ path: '/old-page', redirect: '/new-page' }`
- **false_positive_filter**: `["component:", "children:", "redirect:"]`

### vue-router-link-no-href

- **pattern**: `<router-link(?![^>]*:to)(?![^>]*to=)[^>]*>`
- **severity**: P1
- **wcag**: "2.1.1 Keyboard"
- **description**: "router-link without :to or to binding"
- **example_bad**: `<router-link>Home</router-link>`
- **example_good**: `<router-link to="/">Home</router-link>`
- **false_positive_filter**: `[]`

## Async / Reactive

### vue-async-missing-loading-state

- **pattern**: `await\s+.*\$|\.value\s*=\s*await`
- **severity**: P2
- **wcag**: "N/A"
- **description**: "Async operation without visible loading/error state"
- **example_bad**: `const data = ref(await fetchData())`
- **example_good**: `const loading = ref(true); try { data.value = await fetchData(); } finally { loading.value = false; }`
- **false_positive_filter**: `["loading", "pending", "isLoading"]`

### vue-reactive-missing-cleanup

- **pattern**: `(setInterval|setTimeout|addEventListener|watch\()[^;]*(?!onUnmounted|onBeforeUnmount)`
- **severity**: P2
- **wcag**: "N/A"
- **description**: "Side-effect registration without cleanup in onUnmounted"
- **example_bad**: `onMounted(() => { setInterval(tick, 1000) })`
- **example_good**: `onMounted(() => { const id = setInterval(tick, 1000); onUnmounted(() => clearInterval(id)); })`
- **false_positive_filter**: `["clearInterval", "clearTimeout", "removeEventListener"]
`
