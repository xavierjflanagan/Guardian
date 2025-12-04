# Prompt Caching Deep Dive

**Purpose:** Reference for prompt caching mechanics across providers. See `04-rate-limits-monitoring-retry-strategy.md` for operational strategy.

---

## 1. Provider Comparison

| Provider | Caching | Parallel Compatible | Typical Savings | Best For |
|----------|---------|---------------------|-----------------|----------|
| OpenAI | No | N/A | 0% | High throughput |
| Claude | Yes (ephemeral) | Sequential warmup needed | 35-60% | Large system prompts |
| Gemini | Yes (context) | Yes with cache reference | 40-70% | Large reference docs |

---

## 2. Claude Prompt Caching

```python
# First call - creates cache
response = client.messages.create(
    model="claude-sonnet-4",
    system=[{
        "type": "text",
        "text": "Medical entity extraction prompt...",
        "cache_control": {"type": "ephemeral"}  # Cache this
    }],
    messages=[{"role": "user", "content": "Page content..."}]
)
# Cache lasts ~5 minutes
# Subsequent calls pay 10% for cached portion
```

**Gotcha:** Cache is per-session. Parallel threads don't share cache automatically.

**Solution - Sequential Warmup:**
```python
# 1. Warm up cache with first call
warmup = client.messages.create(...)

# 2. Wait for cache propagation
time.sleep(1)

# 3. Fire parallel calls (now they hit cache)
with ThreadPoolExecutor(max_workers=49) as executor:
    futures = [executor.submit(process_page, p) for p in pages[1:]]
```

---

## 3. Gemini Context Caching

```python
# Create cached context (persists across calls)
cached_context = client.cache.create(
    model="gemini-2.5-flash",
    contents=[
        {"text": "Medical entity extraction instructions..."},
        {"text": "ICD-10 codes: [reference list]..."}
    ],
    ttl="600s"  # 10 minutes
)

# Use in parallel calls - all reference same cache
responses = await asyncio.gather(*[
    client.generate_content(
        cached_content=cached_context.name,
        contents=[{"text": page}]
    ) for page in pages
])
```

**Pricing:**
- Cached input: $0.01875/1M tokens (75% cheaper)
- Uncached input: $0.075/1M tokens
- Cache storage: $1.00/1M tokens/hour

---

## 4. Realistic Savings Calculation

For Pass 1 with ~2,000 token prompt + ~3,000 token page content:

```
WITHOUT CACHING (100 pages):
- 100 calls x 5,000 tokens = 500,000 tokens
- Cost: $1.50

WITH CACHING (100 pages):
- Prompt cached (2,000 tokens): 10% rate = $0.06
- Content uncached (3,000 tokens x 100): full rate = $0.90
- Total: ~$0.96

ACTUAL SAVINGS: ~35% (not 90%)
```

**Why not 90%?** Only the prompt is cached. Unique page content still pays full price.

**To get 90% savings:** Most tokens must be shared context (e.g., large reference docs, code lists).

---

## 5. Exora Recommendation

For Pass 1 parallel batch processing:

1. **Gemini preferred** - Native parallel cache support
2. **Claude viable** - Use sequential warmup pattern
3. **OpenAI** - No caching, but highest rate limits

Expected savings with caching: **35-50%** on input tokens.
