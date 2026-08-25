import rss from '@astrojs/rss';
import { allPosts, summary } from '../lib/posts.mjs';
import { site, author } from '../site.config.mjs';

export async function GET(context) {
  const posts = await allPosts();
  return rss({
    title: site.title,
    description: site.description,
    site: context.site ?? site.url,
    trailingSlash: false,
    customData: `<language>ko-kr</language><managingEditor>${author.email} (${author.name})</managingEditor>`,
    items: posts.map((p) => ({
      title: p.data.title,
      description: summary(p, 220),
      pubDate: p.data.date,
      link: `/posts/${p.id}`,
      categories: [...p.data.tags, p.data.project, p.data.category].filter(Boolean),
      author: `${author.email} (${author.name})`,
    })),
  });
}
