import {
  ARIA_CONTROLS,
  ARIA_LABELLEDBY,
  ARIA_SELECTED,
  DISPLAY_BLOCK,
  UHTMLElement,
  asButton,
  attachStyle,
  attr,
  customElements,
  getRoot,
  off,
  on,
  useId
} from '../utils'

declare global {
  interface HTMLElementTagNameMap {
    'u-tabs': UHTMLTabsElement
    'u-tablist': UHTMLTabListElement
    'u-tab': UHTMLTabElement
    'u-tabpanel': UHTMLTabPanelElement
  }
}

/**
 * The `<u-tabs>` HTML element is used to group a `<u-tablist>` and several `<u-tabpanel>` elements.
 * No MDN reference available.
 */
export class UHTMLTabsElement extends UHTMLElement {
  constructor() {
    super()
    attachStyle(this, DISPLAY_BLOCK)
  }
  get tabList(): UHTMLTabListElement | null {
    return queryWithoutNested('u-tablist', this)[0] || null
  }
  get selectedIndex(): number {
    // Check with real attribute (not .selected) as UHTMLTabElement instance might not be created yet
    return [...this.tabs].findIndex(
      (tab) => attr(tab, ARIA_SELECTED) === 'true'
    )
  }
  set selectedIndex(index: number) {
    attr(this.tabs[index], ARIA_SELECTED, true)
  }
  get tabs(): NodeListOf<UHTMLTabElement> {
    return queryWithoutNested('u-tab', this)
  }
  get panels(): NodeListOf<UHTMLTabPanelElement> {
    return queryWithoutNested('u-tabpanel', this)
  }
}

/**
 * The `<u-tablist>` HTML element serves as the container for a set of `<u-tab>` elements. The `<u-tab>` content are referred to as `<u-tabpanel>` elements.
 * [MDN Reference](https://developer.mozilla.org/en-US/docs/Web/Accessibility/ARIA/Roles/tablist_role)
 */
export class UHTMLTabListElement extends UHTMLElement {
  constructor() {
    super()
    attachStyle(this, DISPLAY_BLOCK)
  }
  connectedCallback() {
    attr(this, 'role', 'tablist')
    on(this, 'click,keydown', this) // Listen for tab events on tablist to minimize amount of listeners
  }
  disconnectedCallback() {
    off(this, 'click,keydown', this)
  }
  handleEvent(event: Event) {
    const { key } = event as KeyboardEvent
    const tabs = [...this.getElementsByTagName('u-tab')]
    let index = tabs.findIndex((tab) => tab.contains(event.target as Node))

    if (event.defaultPrevented || index === -1) return // Event pevented or not a tab
    if (event.type === 'click') tabs[index].selected = true
    if (event.type === 'keydown' && !asButton(event)) {
      if (key === 'ArrowDown' || key === 'ArrowRight')
        index = ++index % tabs.length
      else if (key === 'ArrowUp' || key === 'ArrowLeft')
        index = (index || tabs.length) - 1
      else if (key === 'End') index = tabs.length - 1
      else if (key === 'Home') index = 0
      else return // Do not hijack other keys
      event.preventDefault() // Prevent scroll
      tabs[index].focus()
    }
  }
  get tabsElement(): UHTMLTabsElement | null {
    return this.closest('u-tabs')
  }
}

// Speed up by not triggering attributeChangedCallback during attributeChangedCallback
let SKIP_ATTR_CHANGE = false

/**
 * The `<u-tab>` HTML element is an interactive element inside a `<u-tablist>` that, when activated, displays its associated `<u-tabpanel>`.
 * [MDN Reference](https://developer.mozilla.org/en-US/docs/Web/Accessibility/ARIA/Roles/tab_role)
 */
export class UHTMLTabElement extends UHTMLElement {
  static get observedAttributes() {
    return ['id', ARIA_SELECTED, ARIA_CONTROLS]
  }
  constructor() {
    super()
    attachStyle(
      this,
      `:host(:not([hidden])) { cursor: pointer; display: inline-block }`
    )
  }
  connectedCallback() {
    this.selected = !!this.selected // Ensure selected is set (which also triggers attributeChangedCallback)
  }
  attributeChangedCallback(_name: string, prev: string, next: string) {
    if (!SKIP_ATTR_CHANGE && prev !== next && (SKIP_ATTR_CHANGE = true)) {
      const { tabs = [], panels = [], selectedIndex } = this.tabsElement || {}
      const selected = this.selected ? this : tabs[selectedIndex || 0] || this // Ensure always one selected tab
      let selectedPanel: HTMLElement

      // Ensure correct state by always looping all tabs
      panels.forEach((panel) =>
        attr(panel, { [ARIA_LABELLEDBY]: null, hidden: '' })
      ) // Reset all panels in case changing aria-controls
      tabs.forEach((tab, index) => {
        const tabindex = selected === tab ? 0 : -1
        const panel = getPanel(tab) || panels[index] || null // Does not use tab.panel as UHTMLTabElement instance might not be created yet
        if (!tabindex && panel) selectedPanel = panel // Store selectedPanel as multiple tabs can point to same panel

        attr(tab, {
          [ARIA_SELECTED]: !tabindex,
          [ARIA_CONTROLS]: useId(panel),
          role: 'tab',
          tabindex
        })
        attr(panel, {
          [ARIA_LABELLEDBY]: useId(selectedPanel === panel ? selected : tab),
          hidden: selectedPanel === panel ? null : ''
        })
      })

      SKIP_ATTR_CHANGE = false
    }
  }
  get tabsElement(): UHTMLTabsElement | null {
    return this.closest('u-tabs')
  }
  get tabList(): UHTMLTabListElement | null {
    return this.closest('u-tablist')
  }
  get selected(): boolean {
    return attr(this, ARIA_SELECTED) === 'true'
  }
  set selected(value: boolean) {
    attr(this, ARIA_SELECTED, !!value)
  }
  /** Retrieves the ordinal position of an tab in a tablist. */
  get index(): number {
    return Array.from(this.tabsElement?.tabs || []).indexOf(this)
  }
  get panel(): UHTMLTabPanelElement | null {
    return getPanel(this)
  }
}

/**
 * The `<u-tabpanel>` HTML element is a container for the resources of layered content associated with a `<u-tab>`.
 * [MDN Reference](https://developer.mozilla.org/en-US/docs/Web/Accessibility/ARIA/Roles/tabpanel_role)
 */
export class UHTMLTabPanelElement extends UHTMLElement {
  static get observedAttributes() {
    return ['id']
  }
  constructor() {
    super()
    attachStyle(this, DISPLAY_BLOCK)
  }
  connectedCallback() {
    attr(this, 'role', 'tabpanel')
    this.hidden = Array.from(this.tabs).every((tab) => !tab.selected) // Hide if not connected to tab
  }
  attributeChangedCallback(_name: string, prev: string, next: string) {
    if (!SKIP_ATTR_CHANGE && prev !== next)
      Array.from(getTabs(this, prev), (tab) => attr(tab, ARIA_CONTROLS, next))
  }
  get tabsElement(): UHTMLTabsElement | null {
    return this.closest('u-tabs')
  }
  get tabs(): NodeListOf<UHTMLTabElement> {
    return getTabs(this, this.id)
  }
}

// Return children of tagName, but not if nested inside element with same tagName as container
const queryWithoutNested = <TagName extends keyof HTMLElementTagNameMap>(
  tag: TagName,
  self: Element
): NodeListOf<HTMLElementTagNameMap[TagName]> => {
  const selector = `${tag}:not(:scope ${self.nodeName}:not(:scope) ${tag})`
  return self.querySelectorAll(selector)
}

// Needs to be a utility function so it can be used independendtly from Element life cycle
// Querys elements both inside ShadowRoot and in document just incase trying to access outside shadowRoot elements
const getPanel = (self: Element): UHTMLTabPanelElement | null => {
  const css = `u-tabpanel[id="${attr(self, ARIA_CONTROLS)}"]`
  return getRoot(self).querySelector(css) || document.querySelector(css)
}

// Needs to be a utility function so it can be used independendtly from Element life cycle
// Querys elements both inside ShadowRoot and in document just incase trying to access outside shadowRoot elements
const getTabs = (self: Element, id: string): NodeListOf<UHTMLTabElement> => {
  const css = `u-tab[${ARIA_CONTROLS}="${id}"]`
  return getRoot(self).querySelectorAll(css)
}

customElements.define('u-tabs', UHTMLTabsElement)
customElements.define('u-tablist', UHTMLTabListElement)
customElements.define('u-tab', UHTMLTabElement)
customElements.define('u-tabpanel', UHTMLTabPanelElement)
