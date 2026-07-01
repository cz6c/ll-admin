declare module 'uqrcodejs' {
  interface UQRCodeInstance {
    data: string
    size: number
    margin: number
    canvasContext: unknown
    make: () => void
    drawCanvas: () => Promise<void>
  }

  interface UQRCodeConstructor {
    new (): UQRCodeInstance
  }

  const UQRCode: UQRCodeConstructor
  export default UQRCode
}
