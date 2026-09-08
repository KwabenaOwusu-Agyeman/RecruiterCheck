import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { Container } from '@/components/ui/Container'
import { usePageMeta } from '@/hooks/usePageMeta'
import { BRAND } from '@/lib/constants'
import { NotFoundPage } from '@/pages/NotFoundPage'
import { EMBEDDED_ID, dataUrlFor, itemForPath } from '@/content/runtime'
import type { ContentItem, ContentType } from '@/content/schema'

/**
 * Renders one published editorial item: a resource article, a guide or a
 * newsletter issue. One component, because they differ in their URL namespace
 * and their breadcrumb and in nothing else. A second component per type would
 * be a second place for the metadata and structured data to drift.
 *
 * The body is inserted with dangerouslySetInnerHTML, which is safe here for a
 * specific reason rather than by habit: the shared parser escapes the source
 * before it produces any markup, so raw HTML in a content file is inert text.
 * Nothing user submitted ever reaches this component.
 */
interface EditorialPageProps {
  base: '/resources' | '/newsletter'
  /** Breadcrumb label for the section. */
  sectionName: string
  /** Types this route may render, so /resources cannot serve an issue. */
  accepts: ContentType[]
}

export function EditorialPage({ base, sectionName, accepts }: EditorialPageProps) {
  const { slug } = useParams<{ slug: string }>()
  const path = `${base}/${slug ?? ''}`
  const [item, setItem] = useState<ContentItem | null>(() => itemForPath(path))
  const [resolved, setResolved] = useState(() => itemForPath(path) !== null)

  useEffect(() => {
    if (item || !slug) return
    let cancelled = false
    // Only reached on a client side navigation to a page this build did not
    // prerender. The prerendered path never gets here.
    void fetch(dataUrlFor(path))
      .then((response) => (response.ok ? response.json() : null))
      .then((data: ContentItem | null) => {
        if (cancelled) return
        setItem(data)
        setResolved(true)
      })
      .catch(() => {
        if (!cancelled) setResolved(true)
      })
    return () => {
      cancelled = true
    }
  }, [item, path, slug])

  if (item && !accepts.includes(item.type)) return <NotFoundPage />
  if (!item) return resolved ? <NotFoundPage /> : null

  return <EditorialArticle item={item} base={base} sectionName={sectionName} />
}

function EditorialArticle({
  item,
  base,
  sectionName,
}: {
  item: ContentItem
  base: string
  sectionName: string
}) {
  const path = `${base}/${item.slug}`
  usePageMeta({
    title: `${item.title} | ${BRAND.name}`,
    description: item.description,
    path,
    noindex: item.noindex,
  })

  const url = `${BRAND.canonicalUrl}${path}`

  return (
    <>
      <article className="border-b border-border-soft bg-background py-[40px] sm:py-[56px] lg:py-[64px]">
        <Container>
          <div className="mx-auto flex max-w-3xl flex-col gap-4">
            <p className="text-sm font-medium text-text-secondary">
              {sectionName} · {item.readMinutes} min read
            </p>
            <h1 className="font-display text-3xl font-semibold tracking-tight text-text-primary sm:text-[40px]">
              {item.title}
            </h1>
            <p className="text-lg text-text-secondary">{item.description}</p>
            <div
              className="editorial-body mt-4 flex flex-col gap-4 text-text-primary lg:leading-[1.7]"
              dangerouslySetInnerHTML={{ __html: item.html }}
            />
          </div>
        </Container>
      </article>

      {item.supports.length > 0 && (
        <section className="border-t border-border-soft bg-background py-[32px] sm:py-[44px] lg:py-[56px]">
          <Container>
            <nav className="mx-auto flex max-w-3xl flex-wrap items-center gap-3" aria-label="Related tools">
              <span className="text-sm font-semibold text-text-primary">Related tools:</span>
              {item.supports.map((to) => (
                <Link key={to} to={to} className="text-sm font-medium text-blue hover:underline">
                  {to.replace(/^\//, '').replace(/-/g, ' ')}
                </Link>
              ))}
            </nav>
          </Container>
        </section>
      )}

      {/* Article joins the entity graph shipped in PR #70 by referencing the
          stable #organization and #website ids rather than restating them.
          scripts/prerender.mjs reconciles the CSP hash for this block. */}
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify({
            '@context': 'https://schema.org',
            '@type': 'Article',
            headline: item.title,
            description: item.description,
            datePublished: item.published,
            ...(item.updated ? { dateModified: item.updated } : {}),
            ...(item.image ? { image: `${BRAND.canonicalUrl}${item.image}` } : {}),
            mainEntityOfPage: url,
            publisher: { '@id': `${BRAND.canonicalUrl}/#organization` },
            isPartOf: { '@id': `${BRAND.canonicalUrl}/#website` },
          }),
        }}
      />

      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify({
            '@context': 'https://schema.org',
            '@type': 'BreadcrumbList',
            itemListElement: [
              { '@type': 'ListItem', position: 1, name: 'Home', item: BRAND.canonicalUrl },
              { '@type': 'ListItem', position: 2, name: sectionName, item: `${BRAND.canonicalUrl}${base}` },
              { '@type': 'ListItem', position: 3, name: item.title, item: url },
            ],
          }),
        }}
      />

      {/* Read synchronously by the first client render so hydration matches the
          server output without shipping every content file to the browser. */}
      <script
        type="application/json"
        id={EMBEDDED_ID}
        dangerouslySetInnerHTML={{ __html: JSON.stringify(item).replace(/</g, '\\u003c') }}
      />
    </>
  )
}

export function ResourceArticlePage() {
  return <EditorialPage base="/resources" sectionName="Resources" accepts={['article', 'guide']} />
}

export function NewsletterIssuePage() {
  return <EditorialPage base="/newsletter" sectionName="Newsletter" accepts={['newsletter']} />
}
