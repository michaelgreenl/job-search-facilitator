import { createApp, type App, type Component } from 'vue'

interface MountVueOptions {
    props?: Record<string, unknown>
    install?: (app: App) => void
    style?: Partial<CSSStyleDeclaration>
}

export interface MountedVueComponent {
    app: App
    root: HTMLElement
    unmount: () => void
}

const mountedComponents = new Set<MountedVueComponent>()

export function mountVue(
    component: Component,
    { props, install, style }: MountVueOptions = {},
): MountedVueComponent {
    const root = document.createElement('div')
    Object.assign(root.style, style)
    document.body.append(root)

    const app = createApp(component, props)

    try {
        install?.(app)
        app.mount(root)
    } catch (error) {
        root.remove()
        throw error
    }

    let mounted = true
    const mountedComponent: MountedVueComponent = {
        app,
        root,
        unmount: () => {
            if (!mounted) {
                return
            }

            mounted = false
            app.unmount()
            root.remove()
            mountedComponents.delete(mountedComponent)
        },
    }
    mountedComponents.add(mountedComponent)
    return mountedComponent
}

export function cleanupVueMounts() {
    for (const mountedComponent of mountedComponents) {
        mountedComponent.unmount()
    }
}
