<script setup lang="ts">
import { onLaunch } from '@dcloudio/uni-app'
import { initCloud } from '@/utils/cloud'
import { useGroupStore } from '@/stores/group'

const groupStore = useGroupStore()

onLaunch(() => {
  groupStore.loadLocal()
  initCloud()
})
</script>

<style lang="scss">
page {
  background-color: $page-bg;
  color: $text-primary;
  font-family: -apple-system, BlinkMacSystemFont, 'PingFang SC', 'Microsoft YaHei', sans-serif;
}

view, text, button, input, textarea {
  box-sizing: border-box;
}

.button-primary {
  background-color: $pink-bright;
  color: #fff;
  border-radius: $radius;
  border: none;

  &::after {
    border: none;
  }
}

.button-plain {
  background-color: $pink-peach;
  color: $text-accent;
  border-radius: $radius;
  border: none;

  &::after {
    border: none;
  }
}
</style>
