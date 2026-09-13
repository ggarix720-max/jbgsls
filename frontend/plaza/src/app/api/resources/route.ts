import { readFile } from 'node:fs/promises'
import path from 'node:path'

export const dynamic = 'force-dynamic'

type ResourceItem = {
  id: string
  title: string
  type: 'video' | 'ebook' | 'article'
  url: string
  tags?: string[]
  summary?: string
  source?: string
  addedAt?: string
}

type ResourcesFile = {
  version?: number
  updatedAt?: string
  resources?: ResourceItem[]
}

export async function GET() {
  try {
    const configuredPath = process.env.RESOURCES_FILE || '../../resources/resources.json'

    const reportPath = path.isAbsolute(configuredPath)
      ? configuredPath
      : path.resolve(process.cwd(), configuredPath)

    const payload = JSON.parse(await readFile(reportPath, 'utf8')) as ResourcesFile
    const resources = Array.isArray(payload.resources) ? payload.resources : []
    const tags = [...new Set(resources.flatMap(resource => resource.tags || []))].sort((a, b) => a.localeCompare(b, 'zh-CN'))
    const types = [...new Set(resources.map(resource => resource.type))]

    return Response.json({
      status: 'ready',
      updatedAt: payload.updatedAt || '',
      total: resources.length,
      types,
      tags,
      resources
    })
  } catch (error) {
    return Response.json(
      {
        status: 'unavailable',
        message: '暂时无法读取学习资源清单。',
        detail: error instanceof Error ? error.message : 'unknown error'
      },
      { status: 503 }
    )
  }
}
