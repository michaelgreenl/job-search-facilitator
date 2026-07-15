import { useMediaQuery } from '@vueuse/core'

export function useBreakpoints() {
    const isMobile = useMediaQuery('(max-width: 682px)')

    const isSmPhone = useMediaQuery('(min-width: 332px)')
    const isTablet = useMediaQuery('(min-width: 682px)')
    const isLaptop = useMediaQuery('(min-width: 848px)')
    const isLgLaptop = useMediaQuery('(min-width: 992px)')
    const isXlLaptop = useMediaQuery('(min-width: 1200px)')
    const isXlDesktop = useMediaQuery('(min-width: 1600px)')

    const customMin = (bp: number) => useMediaQuery(`(min-width: ${bp}px)`)

    return {
        isMobile,
        isSmPhone,
        isTablet,
        isLaptop,
        isLgLaptop,
        isXlLaptop,
        isXlDesktop,
        customMin,
    }
}
