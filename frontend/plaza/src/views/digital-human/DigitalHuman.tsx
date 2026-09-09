'use client'

/**
 * 数字人入口：讯飞 Avatar SDK 依赖 WebSocket / WebRTC 等浏览器能力，
 * 这里用 dynamic + ssr:false 关闭服务端渲染，避免构建与预渲染阶段报错。
 */
import dynamic from 'next/dynamic'

const DigitalHumanWidget = dynamic(() => import('./DigitalHumanWidget'), { ssr: false })

const DigitalHuman = () => <DigitalHumanWidget />

export default DigitalHuman
