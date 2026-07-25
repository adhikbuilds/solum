# **AIRE Software \- High Level Architecture Guestimate**

---

Note everything in thi sdocumebt is guesstimate andnot the validated truth. So please thake it with that pinch of salt 

# 

# **High-level architecture**

```
                   User Input
                        │
     ┌──────────────────┴──────────────────┐
     │                                     │
 Project Information                 Site Location
(GFA, FAR, Cost etc.)             (Lat/Lon / Plot ID)
     │                                     │
     └──────────────────┬──────────────────┘
                        │
                Data Aggregation Layer
                        │
    ┌──────────────┬──────────────┬──────────────┐
    │              │              │
 Market DB     GIS/Zoning      Construction DB
 Sales         Planning         Cost Library
 Rentals       Regulations      Finance
 Supply         FAR rules       Inflation
 Demand         Height limits   Interest rates
                        │
                        ▼
            Development Scenario Generator
                        │
      Hundreds/thousands of possible options
                        │
                        ▼
             Financial Modelling Engine
                        │
     Revenue
     Cost
     Cashflow
     NPV
     IRR
     Equity Multiple
                        │
                        ▼
      AI Recommendation / HBU Optimizer
                        │
          "Highest & Best Use"
                        │
                        ▼
          Report Generation (LLM)
```

---

# **Step 1 — Input**

The developer probably enters:

* Plot coordinates  
* Plot area  
* FAR/GFA allowed  
* Location  
* Construction quality  
* Desired asset class  
* Expected financing  
* Timeline

or simply uploads a plot.

---

# **Step 2 — GIS engine**

This is probably the biggest backend component.

The software queries

* zoning  
* parcel boundary  
* surrounding buildings  
* nearby projects  
* road access  
* metro  
* schools  
* offices  
* malls  
* airports

Essentially

```
Site
↓

Everything within
500m
1km
3km
5km
```

This becomes the feature vector.

Think

```
Distance to Metro

Population

Income

Traffic

Office workers

Schools

Retail demand

Vacancy

Competitor projects

Land prices
```

---

# **Step 3 — Market database**

This is probably AIRE's biggest competitive advantage.

They mention **proprietary datasets** covering supply, demand, and market indicators across the Middle East and Africa.

For example, for Dubai:

```
Current apartments

Units sold

Average AED/sqft

Rental yield

Absorption rate

Unsold inventory

Pipeline supply

Vacancy

Historical appreciation

Launch velocity
```

Across different asset classes:

* Residential  
* Retail  
* Office  
* Logistics  
* Hotel  
* Education  
* Healthcare

---

# **Step 4 — Scenario generation**

Instead of analyzing just one concept, the engine likely creates many possible development options.

For example:

```
Scenario A

Residential

180 units

10 retail

5 floors parking


Scenario B

Luxury

120 units

larger apartments


Scenario C

Office


Scenario D

Mixed Use


Scenario E

Hotel
```

Potentially hundreds of permutations.

---

# **Step 5 — Demand prediction**

This is where machine learning likely comes in.

Rather than using fixed assumptions, models estimate things like:

```
Expected selling price

Expected rent

Absorption

Time to sell

Future demand

Occupancy

Exit value
```

Models may use algorithms such as:

* XGBoost  
* LightGBM  
* CatBoost  
* Random Forest  
* Neural Networks (for some predictions)

Most commercial proptech products still rely heavily on gradient-boosted tree models because they perform well on structured tabular data.

---

# **Step 6 — Construction cost engine**

For every scenario:

```
Land cost

Foundation

Structure

Facade

MEP

Finishes

Consultants

Contingency

Marketing

Finance

Interest

Taxes
```

Then:

```
Development Cost
```

---

# **Step 7 — Financial model**

This is essentially an automated Excel feasibility model.

For every month:

```
Cash In

Sales

Rental

Cash Out

Construction

Marketing

Loan Interest

Fees
```

It calculates metrics like:

```
NPV

IRR

ROI

Payback

Cash Flow

Profit Margin

Equity Multiple
```

AIRE specifically states that its reports include comprehensive financial projections such as **IRR, NPV, and cash flow**.

---

# **Step 8 — Highest & Best Use (HBU)**

This is the optimization step.

Instead of asking:

> "Is this residential tower feasible?"

the software asks:

> "What is the most valuable legal use of this land?"

Possible outputs:

```
Residential

IRR = 23%

Office

IRR = 16%

Hotel

IRR = 18%

Mixed Use

IRR = 27%
```

It then recommends the best-performing option based on financial returns and market conditions. This aligns with AIRE's description of automated Highest & Best Use studies.

---

# **Step 9 — AI report generation**

The numerical results are converted into a consultant-style report using an LLM.

Instead of a table:

```
Absorption
23 months
```

The report might say:

> Based on current demand trends and competing inventory, the project is expected to achieve full sell-out within approximately 23 months.

This is the part where generative AI is useful—but it's likely only the final presentation layer.

---

# **What is probably AI vs. traditional software?**

| Component | AI? | Notes |
| ----- | ----- | ----- |
| GIS | ❌ | Spatial queries and mapping |
| Financial model | ❌ | Deterministic Excel-like calculations |
| Cash flow | ❌ | Formula-driven |
| IRR/NPV | ❌ | Standard finance formulas |
| Scenario generator | ⚠️ | Rule-based with optimization |
| Price prediction | ✅ | Machine learning models |
| Demand forecasting | ✅ | Predictive analytics |
| Highest & Best Use ranking | ✅ | Optimization \+ ML |
| Report writing | ✅ | LLM-generated narrative |

---

# **If I were building AIRE today**

I would split it into these microservices:

```
Frontend
    │
API Gateway
    │
├── Authentication
├── Plot Service
├── GIS Service
├── Zoning Engine
├── Market Intelligence
├── Cost Estimation
├── Financial Engine
├── Optimization Engine
├── ML Prediction Service
├── Report Generator
├── Maps Service
└── Document Export
```

The data layer would likely use:

* **PostGIS** for spatial data  
* **PostgreSQL** for transactional and project data  
* A **data warehouse** (e.g., BigQuery or Snowflake) for historical market datasets  
* Object storage for reports and documents

ML services could be implemented in Python (FastAPI), while financial calculations might run in a separate computation service to support large-scale scenario testing.

---

## **My assessment**

The "AI" is **not the core innovation**. The real moat is the **data and decision engine**:

* Proprietary market datasets  
* Automated GIS and zoning analysis  
* Financial modeling  
* Large-scale scenario generation  
* Highest & Best Use optimization

The LLM simply makes the output readable and consultant-friendly.

If I had to estimate the technical complexity:

* **60%** \= proprietary real estate data and market intelligence  
* **20%** \= financial modeling and optimization engine  
* **10%** \= GIS/spatial infrastructure  
* **10%** \= AI (prediction models \+ LLM-generated reports)

This also explains why AIRE advertises **5-day turnaround times** rather than instant answers: much of the value comes from validating data, running multiple scenarios, and producing an investment-grade feasibility report rather than generating text alone.

