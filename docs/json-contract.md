# JSON 接入协议

输入必须是精排任务完成后的结果对象，版本固定为 `nautilus-quote-result/1`。建议直接透传精排服务的完整结果，避免对方二次摘字段漏掉绑定、报价或排除项。

## 输入结构

```text
result
├── schema_version: "nautilus-quote-result/1"
├── status: "completed"
├── request_sha256: 请求标识
├── generated_at: 带时区的生成时间
├── totals: { releases: 心愿数, sources: 全部货源数 }
├── tag_groups: { work: "作品", version: "版本", ... }
├── pricing_context
│   ├── userProfiles[]
│   │   └── id / wishId / targetReleaseId / nickname / pricing
│   └── wishBindings[releaseId]: { profileId, wishId }
├── releases[]
│   ├── id: 字符串 Release ID
│   ├── basic: { release_id, title, artists[], year, country, medium, formats[] }
│   ├── artist / identifiers: { barcode, catno, labels[], identifiers[] }
│   ├── wish_context
│   │   ├── wish_id / target_release_id / nickname / work_title
│   │   ├── requested_at / first_login_at / last_login_at
│   │   ├── payment_history: { lowest_cny, highest_cny }
│   │   └── statistics: { totalwant, supplytotal, paytotal, payrate, priceratio }
│   ├── requirements: { version_requirement, remark, obi_requirement_raw, demand_raw }
│   ├── cover / user_avatar / reference_images[]: 图片对象
│   ├── rerank: { summary, ... }
│   └── sources[]
│       ├── id: "releaseId:platform:productId"，全局唯一
│       ├── title / platform_code / platform / product_id / url
│       ├── images[]: { id, url, local, kind }
│       ├── seller / seller_rate_percent
│       ├── condition: { m_media, s_sleeve, original_condition: { comments } }
│       ├── dimensions29: { "01": ..., "02": ..., ... "29": ... }
│       ├── unified_facts / display_tags / semantics_status / extraction_findings
│       ├── ranking
│       │   ├── rank: 全量排序序号（1…N）
│       │   ├── candidate_rank: 候选序号或 null
│       │   ├── eligibility: eligible | manual_review | excluded
│       │   ├── tags[]: { code, module, dimension, label, state, observed, target, effect, reason, evidence }
│       │   └── estimated_cost
│       │       ├── selected_route: 选中路线或 null
│       │       ├── routes[]: 完整路线
│       │       └── partial_quotes[]: 费用不完整的报价
│       ├── quote_pricing
│       │   ├── userProfileId
│       │   ├── summary / reason: 内部定价依据
│       │   └── result: { costCny, quoteCny, prepayment, status, floorCny, explanationContext, ... }
│       └── quote_copy: { status, description, evidence, reviewed, ... }
└── limitations[]
```

字段名称与上游保持一致。`dimensions29` 的值是上游输出的字段及证据，不是前端自行定义的 29 个简单字符串；可以为空，按原样保留。前端卡片使用已验证的 `ranking.tags`，侧标读取 `unified_facts.items[].obi`。

### 重要约束

1. 输入 `status` 必须是 `completed`。本前端不轮询任务，也不处理原始找货 JSON。
2. `totals.sources` 包含排除项；心愿内 `ranking.rank` 必须完整且不重复。平台筛选只在页面上做。
3. `wishBindings`、`wish_context`、`userProfiles` 和每条 `quote_pricing.userProfileId` 必须互相吻合。昵称不能当用户主键。
4. 每条货源都要有 `dimensions29` 的 01–29 键及 `quote_pricing`；无可用报价用 `quoteCny: null`，不能删除整个对象。
5. `quote_pricing.result.costCny` 与 `selected_route.total_cost_cny` 一致；没有选中路线时为 `null`。
6. 当前一份结果只允许每个 Release ID 出现一次。多次 `loadResult` 是替换，不是累计导入；多心愿由上游生成完整 `releases` 数组。
7. `quote_copy.status !== completed` 时没有模型默认文案。其余货源仍展示，操作员可自行填写。
8. `payrate / priceratio` 为 0–1 比例；`seller_rate_percent` 为 0–100 百分数。不要混用。

### 成本路线

```json
{
  "route_id": "gb-to-cn",
  "warehouse_id": "gb",
  "calculation_complete": true,
  "usable_for_ranking": true,
  "components_cny": {"sale": 87.5, "tax": 0, "shipping": 10},
  "transfer_to_china_cny": 15,
  "total_cost_cny": 112.5,
  "notes": []
}
```

这是演示路线。前端按返回值展示，没有把分项相加后替换服务器成本。对无法计算的路线，分项未知保留 `null`；不能填成零。

### 图片

`url` 是 HTTP(S) 原图 URL；`local` 是上游代理地址，在静态前端里会重新解析。`kind` 常见 `listing_image`、`seller_item_photo`、`release_reference`、`work_reference`。后两种仅做参考，不默认选入报价图片。

平台代码沿用上游：`EBAYUKUS`、`YAHOOJAPAN`、`MERC`、`DSUS`、`AMJP`、`DISKUNION`。其他代码仍可展示并筛选，但只显示文字平台名。

### 可选历史成交价扩展

只有己方已经取到可靠数据时才填写，不从目标标题猜价：

```json
"sales_history": {
  "lowest_cny": 80,
  "median_cny": 140,
  "highest_cny": 230,
  "is_example": true
}
```

这里的值是虚构样例，所以 `is_example` 为 `true`。真实结果未提供该对象时显示 `—`。此扩展只显示，不影响精排或机器报价。

## 定价与预付款

`result.version = source-user-quote-v3-priceratio` 表示按原始用户 `priceratio` 加价。
`quoteCny` 是总报价，`priceRatio` 是成本加价比例。预付金额不是额外收费。

`quote_pricing.result.prepayment` 与导出草稿的 `prepayment` 使用同一结构：

| 字段 | 含义 |
| --- | --- |
| `rule` | `quote-prepayment/1` |
| `quoteCny` | 此次预付计算对应的总报价 |
| `amountCny` | 应预付金额 |
| `remainingCny` | 尾款；与预付相加等于总报价 |
| `baseCny` | 总报价三分之一，按分取整 |
| `adjustmentCny` | 相对基准的调整，-10 到 10 元 |

以上金额均为人民币数值，最多两位小数。无法报价时预付为 `null`。规则以用户 profile ID、精确版本 ID（非精确匹配为 null）、货源 candidate ID 和报价分数生成稳定调整；参考 `returned-pricing.js`，业务后端应复核，不能每次刷新随机抽取。新结果直接展示服务端返回的预付款；旧结果缺少该字段时兼容计算。人工改价后的预付款放在草稿里，原始 `getResult()` 不变。

## 输出：人工报价草稿

`getSelection()`、导出 JSON 和 `nautilus:quote-saved` 的内容如下（均为示例）：

```json
{
  "schema_version": "nautilus-quote-draft/1",
  "result_id": "浏览器为结果快照生成的标识",
  "request_sha256": "上游请求标识",
  "wish_id": "DEMO-WISH-a",
  "user_profile_id": "DEMO-PROFILE-a",
  "release_id": "91000001",
  "source_id": "91000001:EBAYUKUS:DEMO-1",
  "platform_code": "EBAYUKUS",
  "product_id": "DEMO-a-1",
  "original_rank": 1,
  "candidate_rank": 1,
  "quote_cny": 138,
  "machine_quote_cny": 146.25,
  "prepayment": {
    "rule": "quote-prepayment/1",
    "quoteCny": 138,
    "amountCny": 50.39,
    "remainingCny": 87.61,
    "baseCny": 46,
    "adjustmentCny": 4.39
  },
  "description": "操作员确认后的报价说明",
  "image_urls": ["https://example.com/nautilus-demo/a-1.svg"],
  "validation": {"valid": true, "message": "保存仅留在本机。"},
  "updated_at": "2026-11-22T06:00:00.000Z"
}
```

`result_id` 用于区分浏览器草稿，不是权限凭证；HTTPS/localhost 使用内容 SHA-256，普通 HTTP 无 Web Crypto 时使用本地草稿标识。所有客户端字段都应由对方后端复核，不能依据浏览器给出的 `validation.valid` 直接采购或发消息。

草稿没有“已发送”状态，也不会修改 `getResult()` 返回的原始结果。保存/报价发送动作属于原平台的业务接口。
