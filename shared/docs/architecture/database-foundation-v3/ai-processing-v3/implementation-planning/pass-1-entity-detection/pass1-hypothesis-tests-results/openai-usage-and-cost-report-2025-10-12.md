# OpenAI Usage and Cost Report — 2025-10-12

Status: snapshot from OpenAI usage/billing. Includes raw TSV blocks for easy spreadsheet import plus daily cost totals.

Pricing used (Standard tier, gpt-5-mini):
- Input: $0.25 per 1M tokens
- Output: $2.00 per 1M tokens
- Cached input: $0.025 per 1M tokens (if present)

Cost formula (gpt-5-mini):
- cost = 0.25e-6 × input_tokens + 2.00e-6 × output_tokens + 0.025e-6 × input_cached_tokens

## Daily totals (billing extract)
```tsv
start_time	end_time	start_time_iso	end_time_iso	amount_value	amount_currency	line_item	project_id	organization_id	organization_name
1759622400	1759708800	2025-10-05T00:00:00+00:00	2025-10-06T00:00:00+00:00	0.8958740000000000	usd			org-Hp9mSGev2sVmtMeF2wrnSeOV	Personal
1759708800	1759795200	2025-10-06T00:00:00+00:00	2025-10-07T00:00:00+00:00	0.5617712500000000	usd			org-Hp9mSGev2sVmtMeF2wrnSeOV	Personal
1759795200	1759881600	2025-10-07T00:00:00+00:00	2025-10-08T00:00:00+00:00	0.569788	usd			org-Hp9mSGev2sVmtMeF2wrnSeOV	Personal
1759881600	1759968000	2025-10-08T00:00:00+00:00	2025-10-09T00:00:00+00:00	0.5455665000000000	usd			org-Hp9mSGev2sVmtMeF2wrnSeOV	Personal
1759968000	1760054400	2025-10-09T00:00:00+00:00	2025-10-10T00:00:00+00:00							
1760054400	1760140800	2025-10-10T00:00:00+00:00	2025-10-11T00:00:00+00:00	0.34090000000000000	usd			org-Hp9mSGev2sVmtMeF2wrnSeOV	Personal
1760140800	1760227200	2025-10-11T00:00:00+00:00	2025-10-12T00:00:00+00:00	0.072054	usd			org-Hp9mSGev2sVmtMeF2wrnSeOV	Personal
1760227200	1760313600	2025-10-12T00:00:00+00:00	2025-10-13T00:00:00+00:00							
```

## Model usage (TSV snapshot)
```tsv
start_time	end_time	start_time_iso	end_time_iso	project_id	num_model_requests	user_id	api_key_id	model	batch	service_tier	input_tokens	output_tokens	input_cached_tokens	input_uncached_tokens	input_text_tokens	output_text_tokens	input_cached_text_tokens	input_audio_tokens	input_cached_audio_tokens	output_audio_tokens	input_image_tokens	input_cached_image_tokens	output_image_tokens
1759622400	1759708800	2025-10-05T00:00:00+00:00	2025-10-06T00:00:00+00:00	proj_4BhNtYH0z7dWbBtzhibxa65W	10.0	user-dAU7Ud7OljwJvKfi4wQzWHyV	key_OYRZfEkH5R9CNgtY	gpt-4o-2024-08-06	FALSE	default	59200.0	10646.0	5760.0	53440.0	53440.0	10646.0	5760.0	0.0	0.0	0.0	0.0	0.0	0.0
1759708800	1759795200	2025-10-06T00:00:00+00:00	2025-10-07T00:00:00+00:00	proj_4BhNtYH0z7dWbBtzhibxa65W	8.0	user-dAU7Ud7OljwJvKfi4wQzWHyV	key_OYRZfEkH5R9CNgtY	gpt-5-2025-08-07	FALSE	default	46264.0	60000.0	8192.0	38072.0	38072.0	60000.0	8192.0	0.0	0.0	0.0	0.0	0.0	0.0
1759708800	1759795200	2025-10-06T00:00:00+00:00	2025-10-07T00:00:00+00:00	proj_4BhNtYH0z7dWbBtzhibxa65W	1.0	user-dAU7Ud7OljwJvKfi4wQzWHyV	key_OYRZfEkH5R9CNgtY	gpt-5-2025-08-07	FALSE	default	5783.0	16000.0	0.0	5783.0	5783.0	16000.0	0.0	0.0	0.0	0.0	0.0	0.0	0.0
1759795200	1759881600	2025-10-07T00:00:00+00:00	2025-10-08T00:00:00+00:00	proj_4BhNtYH0z7dWbBtzhibxa65W	21.0	user-dAU7Ud7OljwJvKfi4wQzWHyV	key_OYRZfEkH5R9CNgtY	gpt-5-mini-2025-08-07	FALSE	default	80992.0	274770.0	0.0	80992.0	80992.0	274770.0	0.0	0.0	0.0	0.0	0.0	0.0	0.0
1759881600	1759968000	2025-10-08T00:00:00+00:00	2025-10-09T00:00:00+00:00																						
1760054400	1760140800	2025-10-10T00:00:00+00:00	2025-10-11T00:00:00+00:00	proj_4BhNtYH0z7dWbBtzhibxa65W	11.0	user-dAU7Ud7OljwJvKfi4wQzWHyV	key_OYRZfEkH5R9CNgtY	gpt-5-mini-2025-08-07	FALSE	default	124784.0	154852.0	0.0	124784.0	124784.0	154852.0	0.0	0.0	0.0	0.0	0.0	0.0	0.0
1760140800	1760227200	2025-10-11T00:00:00+00:00	2025-10-12T00:00:00+00:00	proj_4BhNtYH0z7dWbBtzhibxa65W	2.0	user-dAU7Ud7OljwJvKfi4wQzWHyV	key_OYRZfEkH5R9CNgtY	gpt-5-mini-2025-08-07	FALSE	default	22688.0	33191.0	0.0	22688.0	22688.0	33191.0	0.0	0.0	0.0	0.0	0.0	0.0	0.0
```

## Cost per run (last 10 runs)

Assumptions:
- Same 1-page JPEG input per run
- Pricing and formula above (gpt-5-mini)
- Latest 10 runs are: 2 runs on 2025-10-11 and 8 of the 11 runs on 2025-10-10 (both `gpt-5-mini-2025-08-07`)

Per-run token averages and cost:
```tsv
date	runs_counted	per_run_input_tokens	per_run_output_tokens	per_run_cached_input_tokens	per_run_cost_usd
2025-10-11	2	11344.0	16595.5	0.0	0.036027
2025-10-10	8 of 11	11344.0	14077.4545	0.0	0.0309909
```

Computation (per run):
- input_cost = 0.25e-6 × per_run_input_tokens
- output_cost = 2.00e-6 × per_run_output_tokens
- total_cost = input_cost + output_cost

Weighted average across last 10 runs:
- (8 × 0.0309909 + 2 × 0.036027) ÷ 10 = $0.031998
- Note: 2 × 0.036027 = $0.072054, matching the daily total for 2025-10-11 in the billing extract.


