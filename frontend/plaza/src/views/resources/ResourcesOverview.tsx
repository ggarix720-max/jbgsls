'use client'

import { useEffect, useMemo, useState } from 'react'

import Alert from '@mui/material/Alert'
import Avatar from '@mui/material/Avatar'
import Button from '@mui/material/Button'
import Card from '@mui/material/Card'
import CardContent from '@mui/material/CardContent'
import Chip from '@mui/material/Chip'
import Grid from '@mui/material/Grid'
import LinearProgress from '@mui/material/LinearProgress'
import Typography from '@mui/material/Typography'

import { withBasePath } from '@/lib/base-path'
import { loadProfile } from '@/views/digital-human/user-profile'

type ResourceType = 'video' | 'ebook' | 'article'

type ResourceItem = {
  id: string
  title: string
  type: ResourceType
  url: string
  tags?: string[]
  summary?: string
  source?: string
  addedAt?: string
}

type ResourcesData = {
  status: string
  updatedAt: string
  total: number
  types: string[]
  tags: string[]
  resources: ResourceItem[]
}

const typeMeta: Record<ResourceType, { label: string; icon: string; color: string }> = {
  video: { label: '视频', icon: 'ri-play-circle-line', color: '#8C57FF' },
  ebook: { label: '电子书', icon: 'ri-book-2-line', color: '#C1842B' },
  article: { label: '推文', icon: 'ri-article-line', color: '#4E6BA6' }
}

const interestOrder = [
  '低温储粮',
  '气调储藏',
  '熏蒸杀虫',
  '霉变防治',
  '水分控制',
  '通风与粮温',
  '仓房与设施',
  '品质检验',
  '绿色储粮',
  '出入库管理',
  '安全管理',
  '标准与规程'
]

const ResourcesOverview = () => {
  const [data, setData] = useState<ResourcesData | null>(null)
  const [error, setError] = useState('')
  const [typeFilter, setTypeFilter] = useState('全部')
  const [tagFilter, setTagFilter] = useState('全部')
  const [interests, setInterests] = useState<string[]>([])

  useEffect(() => {
    setInterests(loadProfile().interests)

    fetch(withBasePath('/api/resources'), { cache: 'no-store' })
      .then(async response => {
        const payload = await response.json()

        if (!response.ok) throw new Error(payload.message || '读取学习资源失败')
        setData(payload as ResourcesData)
      })
      .catch(reason => setError(reason instanceof Error ? reason.message : '读取学习资源失败'))
  }, [])

  const recommendedIds = useMemo(() => {
    const hit = (resource: ResourceItem) => (resource.tags || []).some(tag => interests.includes(tag))

    return new Set((data?.resources || []).filter(hit).map(resource => resource.id))
  }, [data?.resources, interests])

  const visibleResources = useMemo(() => {
    const score = (resource: ResourceItem) => (resource.tags || []).filter(tag => interests.includes(tag)).length

    return (data?.resources || [])
      .filter(resource => typeFilter === '全部' || resource.type === typeFilter)
      .filter(resource => tagFilter === '全部' || (resource.tags || []).includes(tagFilter))
      .sort((a, b) => score(b) - score(a) || (b.addedAt || '').localeCompare(a.addedAt || ''))
  }, [data?.resources, interests, tagFilter, typeFilter])

  const orderedTags = useMemo(() => {
    const present = new Set(data?.tags || [])
    const known = interestOrder.filter(tag => present.has(tag))
    const extra = (data?.tags || []).filter(tag => !interestOrder.includes(tag))

    return [...known, ...extra]
  }, [data?.tags])

  if (error) return <Alert severity='error'>{error}</Alert>
  if (!data) return <LinearProgress />

  const countOf = (type: ResourceType) => data.resources.filter(resource => resource.type === type).length

  return (
    <Grid container spacing={6}>
      <Grid item xs={12}>
        <Card>
          <CardContent className='flex flex-col justify-between gap-5 md:flex-row md:items-center'>
            <div className='flex items-center gap-4'>
              <Avatar variant='rounded' sx={{ width: 56, height: 56, bgcolor: 'primary.lighterOpacity', color: 'primary.main' }}>
                <i className='ri-compass-3-line text-3xl' />
              </Avatar>
              <div>
                <Typography variant='h4' className='font-semibold'>学习资源推荐</Typography>
                <Typography color='text.secondary'>与粮储学科相关的视频、电子书与推文，按你的关注方向优先排序</Typography>
              </div>
            </div>
            <Chip icon={<i className='ri-refresh-line' />} label={`更新于 ${data.updatedAt || '未知'}`} variant='outlined' />
          </CardContent>
        </Card>
      </Grid>

      {[
        { label: '资源总数', value: data.total, unit: '条', icon: 'ri-archive-line', color: '#8C57FF' },
        { label: '视频', value: countOf('video'), unit: '条', icon: typeMeta.video.icon, color: typeMeta.video.color },
        { label: '电子书', value: countOf('ebook'), unit: '条', icon: typeMeta.ebook.icon, color: typeMeta.ebook.color },
        { label: '推文', value: countOf('article'), unit: '条', icon: typeMeta.article.icon, color: typeMeta.article.color }
      ].map(item => (
        <Grid item xs={12} sm={6} lg={3} key={item.label}>
          <Card>
            <CardContent className='flex items-center gap-4'>
              <Avatar variant='rounded' sx={{ bgcolor: `${item.color}18`, color: item.color }}>
                <i className={`${item.icon} text-xl`} />
              </Avatar>
              <div>
                <Typography variant='body2' color='text.secondary'>{item.label}</Typography>
                <Typography variant='h5' className='font-semibold'>{item.value} <small>{item.unit}</small></Typography>
              </div>
            </CardContent>
          </Card>
        </Grid>
      ))}

      <Grid item xs={12}>
        <Card>
          <CardContent className='flex flex-col gap-4'>
            <div className='flex flex-wrap items-center gap-2'>
              <Typography variant='body2' color='text.secondary' className='me-2'>类型</Typography>
              {['全部', 'video', 'ebook', 'article'].map(type => (
                <Chip
                  key={type}
                  label={type === '全部' ? '全部' : typeMeta[type as ResourceType].label}
                  size='small'
                  color={typeFilter === type ? 'primary' : 'default'}
                  variant={typeFilter === type ? 'filled' : 'outlined'}
                  onClick={() => setTypeFilter(type)}
                />
              ))}
            </div>
            <div className='flex flex-wrap items-center gap-2'>
              <Typography variant='body2' color='text.secondary' className='me-2'>方向</Typography>
              <Chip
                label='全部'
                size='small'
                color={tagFilter === '全部' ? 'primary' : 'default'}
                variant={tagFilter === '全部' ? 'filled' : 'outlined'}
                onClick={() => setTagFilter('全部')}
              />
              {orderedTags.map(tag => (
                <Chip
                  key={tag}
                  label={tag}
                  size='small'
                  color={tagFilter === tag ? 'primary' : interests.includes(tag) ? 'success' : 'default'}
                  variant={tagFilter === tag ? 'filled' : 'outlined'}
                  onClick={() => setTagFilter(tag)}
                />
              ))}
            </div>
            {interests.length === 0 && (
              <Alert severity='info' icon={<i className='ri-lightbulb-flash-line' />}>
                还没有你的关注画像：去「智能问答」提几个问题后，这里会按你的关注方向优先推荐。
              </Alert>
            )}
            {interests.length > 0 && (
              <Typography variant='body2' color='text.secondary'>
                你的关注方向：{interests.join('、')}（带「为你推荐」标识的资源排在最前）
              </Typography>
            )}
          </CardContent>
        </Card>
      </Grid>

      <Grid item xs={12}>
        <Typography variant='h5' className='mb-4 font-semibold'>资源列表（{visibleResources.length} 条）</Typography>
        <Grid container spacing={4}>
          {visibleResources.map(resource => {
            const meta = typeMeta[resource.type] || typeMeta.article

            return (
              <Grid item xs={12} sm={6} lg={4} key={resource.id}>
                <Card variant='outlined' sx={{ height: '100%' }}>
                  <CardContent className='flex h-full flex-col gap-3'>
                    <div className='flex items-center justify-between'>
                      <div className='flex items-center gap-2'>
                        <Avatar variant='rounded' sx={{ bgcolor: `${meta.color}18`, color: meta.color }}>
                          <i className={`${meta.icon} text-xl`} />
                        </Avatar>
                        <Chip label={meta.label} size='small' variant='outlined' />
                      </div>
                      {recommendedIds.has(resource.id) && <Chip label='为你推荐' size='small' color='success' variant='tonal' />}
                    </div>
                    <Typography variant='h6' className='font-semibold'>{resource.title}</Typography>
                    <Typography variant='body2' color='text.secondary' sx={{ flexGrow: 1 }}>
                      {resource.summary || '暂无简介'}
                    </Typography>
                    <div className='flex flex-wrap gap-1'>
                      {(resource.tags || []).map(tag => (
                        <Chip
                          key={tag}
                          label={tag}
                          size='small'
                          color={interests.includes(tag) ? 'success' : 'default'}
                          variant='outlined'
                        />
                      ))}
                    </div>
                    <div className='flex items-center justify-between'>
                      <Typography variant='caption' color='text.secondary'>
                        {resource.source || '未知来源'}
                      </Typography>
                      <Button
                        size='small'
                        variant='outlined'
                        href={resource.url}
                        target='_blank'
                        rel='noopener noreferrer'
                        endIcon={<i className='ri-external-link-line' />}
                      >
                        打开链接
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              </Grid>
            )
          })}
        </Grid>
        {visibleResources.length === 0 && (
          <Alert severity='warning' className='mt-4'>当前筛选条件下没有资源，换个类型或方向试试。</Alert>
        )}
      </Grid>
    </Grid>
  )
}

export default ResourcesOverview
