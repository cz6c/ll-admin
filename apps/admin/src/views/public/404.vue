<template>
  <div class="wscn-http404">
    <div class="pic-404">
      <img class="pic-404__parent" src="/src/assets/images/404_images/404.png" alt="404" />
      <img class="pic-404__child left" src="/src/assets/images/404_images/404_cloud.png" alt="404" />
      <img class="pic-404__child mid" src="/src/assets/images/404_images/404_cloud.png" alt="404" />
    </div>
    <div class="bullshit">
      <div class="bullshit__oops">Sorry!</div>
      <div class="bullshit__headline">Page not found or not authorized to access...</div>
      <div class="bullshit__info">Please check that the URL you entered is correct, or click the button below to return to the homepage.</div>
      <a href="/" class="bullshit__return-home" style="margin-top: 20px">back home</a>
    </div>
  </div>
</template>

<script setup lang="ts">
defineOptions({
  name: "PAGE_NOT_FOUND_NAME"
});
</script>

<style lang="scss" scoped>
.wscn-http404 {
  display: flex;
  justify-content: center;
  align-items: center;
  overflow: hidden;
  height: 100%;
  background-color: #cce3ff;

  .pic-404 {
    position: relative;
    width: 836px;

    &__parent {
      width: 100%;
    }

    &__child {
      position: absolute;

      @keyframes cloudLeft {
        0% {
          top: 17px;
          left: 220px;
          opacity: 0;
        }

        20% {
          top: 33px;
          left: 188px;
          opacity: 1;
        }

        80% {
          top: 81px;
          left: 92px;
          opacity: 1;
        }

        100% {
          top: 97px;
          left: 60px;
          opacity: 0;
        }
      }
      @keyframes cloudMid {
        0% {
          top: 10px;
          left: 420px;
          opacity: 0;
        }

        20% {
          top: 40px;
          left: 360px;
          opacity: 1;
        }

        70% {
          top: 130px;
          left: 180px;
          opacity: 1;
        }

        100% {
          top: 160px;
          left: 120px;
          opacity: 0;
        }
      }

      &.left {
        top: 17px;
        left: 220px;
        width: 80px;
        opacity: 0;
        animation-name: cloudLeft;
        animation-duration: 2s;
        animation-timing-function: linear;
        animation-fill-mode: forwards;
        animation-delay: 1s;
      }

      &.mid {
        top: 10px;
        left: 420px;
        width: 46px;
        opacity: 0;
        animation-name: cloudMid;
        animation-duration: 2s;
        animation-timing-function: linear;
        animation-fill-mode: forwards;
        animation-delay: 1.2s;
      }
    }
  }

  .bullshit {
    padding: 60px;
    width: 368px;
    @keyframes slideUp {
      0% {
        transform: translateY(60px);
        opacity: 0;
      }

      100% {
        transform: translateY(0);
        opacity: 1;
      }
    }

    &__oops {
      margin-bottom: 20px;
      font-size: 32px;
      font-weight: bold;
      color: #5353dd;
      opacity: 0;
      line-height: 40px;
      animation-name: slideUp;
      animation-duration: 0.5s;
      animation-fill-mode: forwards;
    }

    &__headline {
      margin-bottom: 10px;
      font-size: 20px;
      font-weight: bold;
      color: #222;
      opacity: 0;
      line-height: 24px;
      animation-name: slideUp;
      animation-duration: 0.5s;
      animation-delay: 0.1s;
      animation-fill-mode: forwards;
    }

    &__info {
      margin-bottom: 30px;
      font-size: 13px;
      color: grey;
      opacity: 0;
      line-height: 21px;
      animation-name: slideUp;
      animation-duration: 0.5s;
      animation-delay: 0.2s;
      animation-fill-mode: forwards;
    }

    &__return-home {
      display: block;
      border-radius: 100px;
      width: 110px;
      height: 36px;
      font-size: 14px;
      text-align: center;
      text-decoration: none;
      color: #fff;
      background: #5353dd;
      opacity: 0;
      line-height: 36px;
      cursor: pointer;
      animation-name: slideUp;
      animation-duration: 0.5s;
      animation-delay: 0.3s;
      animation-fill-mode: forwards;
    }
  }
}
</style>
