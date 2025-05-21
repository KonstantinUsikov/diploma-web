import { ref, watch, computed } from 'vue'
import { useInterval, useMouse, useWindowScroll } from '@vueuse/core'

export function useCircuitImage(circuit_image: Ref<string | null>) {
    const original_width = ref<number | null>(null)
    const original_height = ref<number | null>(null)

    watch(circuit_image, async (newVal) => {
        if (!newVal) return
        try {
            const img = new Image()
            img.src = newVal
            await img.decode()
            original_width.value = img.naturalWidth
            original_height.value = img.naturalHeight
        } catch (error) {
            console.error('Ошибка при декодировании изображения:', error)
        }
    })

    const image_element = ref(null)
    const image_element_factor = computed(() => {
        const width = image_element.value?.width ?? 0
        const original = original_width.value ?? 1
        return width / original
    })

    const current_viewer = ref<any>(null)
    const current_image_data = ref<any>({})
    const computed_viewer = ref<any>(null)

    useInterval(1000 / 60, {
        callback: () => {
            const circuit_image_element = document.getElementById('circuit_image_element')
            if (circuit_image_element != null) {
                image_element.value = circuit_image_element.getBoundingClientRect()
            }
            if (current_viewer.value != null) {
                current_image_data.value = current_viewer.value.imageData
                if (!current_viewer.value.ready) {
                    current_viewer.value = null
                }
            }
            computed_viewer.value = {
                transform: current_viewer.value
                    ? `scale(${current_image_data.value?.ratio})`
                    : `scale(${image_element_factor.value ?? 1})`,
                left: current_viewer.value ? `${current_image_data.value?.left}px` : '',
                top: current_viewer.value ? `${current_image_data.value?.top}px` : '',
            }
        },
    })

    const { x, y } = useMouse()
    const { y: windowY } = useWindowScroll()

    const context_open = ref(false)
    const virtualElement = ref({ getBoundingClientRect: () => ({}) })
    const context_data = ref({})

    function onContextMenu(data: {}) {
        const top = unref(y) - unref(windowY)
        const left = unref(x)
        virtualElement.value.getBoundingClientRect = () => ({
            width: 0,
            height: 0,
            top,
            left,
        })
        context_open.value = true
        context_data.value = data
    }

    function onContextMenuSafe(component: any) {
        const { image, ...dataWithoutImage } = component
        onContextMenu(dataWithoutImage)
    }

    return {
        original_width,
        original_height,
        image_element,
        image_element_factor,
        current_viewer,
        current_image_data,
        computed_viewer,
        context_open,
        virtualElement,
        context_data,
        onContextMenu,
        onContextMenuSafe,
    }
}
