<script setup lang="ts">
const props = defineProps<{
  x: number
  y: number
  w: number
  h: number
  background: string
  borderColor: string
  borderWidth: number
  originalWidth: number
  originalHeight: number
  contextData: any
}>()

const emit = defineEmits(['contextmenu'])

const computedStyle = computed(() => ({
  marginLeft: `${props.x * props.originalWidth - props.w * props.originalWidth / 2}px`,
  marginTop: `${props.y * props.originalHeight - props.h * props.originalHeight / 2}px`,
  width: `${props.w * props.originalWidth}px`,
  height: `${props.h * props.originalHeight}px`,
  background: props.background,
  borderColor: props.borderColor,
  borderWidth: `${props.borderWidth}px`,
  borderStyle: 'solid',
}))

function handleClick() {
  if ((window as any).current_viewer == null) {
    (window as any).current_viewer = (window as any).ViewerApi({ images: [(window as any).report_circuit_image] })
  }
}

function handleContextMenu() {
  emit('contextmenu', props.contextData)
}
</script>

<template>
  <div
      :style="computedStyle"
      style="
      position: absolute;
      border-radius: 0.25rem;
      z-index: 2;
      pointer-events: painted;
    "
      @click="handleClick"
      @contextmenu.prevent="handleContextMenu"
  />
</template>

<style scoped>
</style>
