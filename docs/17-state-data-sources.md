# State Data Sources

This catalog is a future research backlog for Indian state and union territory coverage. Active implementation is frozen to West Bengal and Karnataka, with Bengaluru completed first. Do not create additional state registries or adapters from this catalog until the two launch regions work reliably end to end.

General national references:

- Ministry of Road Transport and Highways: https://www.morth.gov.in/
- GTFS specification: https://gtfs.org/documentation/overview/
- Delhi Open Transit Data documentation: https://otd.delhi.gov.in/documentation/
- MobilityData sharing-data directory guidance: https://gtfs.org/resources/sharing-data/

## Legend

| Field | Meaning |
| --- | --- |
| Priority | `P0` immediate, `P1` early expansion, `P2` later, `P3` long tail |
| Scraping | Initial feasibility guess: Easy, Medium, Hard, Unknown |
| GTFS | Known, Candidate, Unknown, or None found |
| Adapter | Planned provider key |

## States

### Andhra Pradesh

| Category | Sources |
| --- | --- |
| Government | APSRTC: https://apsrtc.ap.gov.in/ |
| Private | RedBus/AbhiBus-style aggregators need legal review |
| GTFS | Unknown |
| Scraping | Medium |
| Adapter | `apsrtc` |
| Priority | P2 |
| Notes | Official site has live tracking and reservation links; verify data endpoint terms before use. |

### Arunachal Pradesh

| Category | Sources |
| --- | --- |
| Government | State transport department and state portal candidates |
| Private | Local shared taxi/bus operators, district-level sources |
| GTFS | Unknown |
| Scraping | Hard |
| Adapter | `arunachal-transport` |
| Priority | P3 |
| Notes | Likely requires community and district transport office research. |

### Assam

| Category | Sources |
| --- | --- |
| Government | ASTC and Assam transport department candidates |
| Private | Guwahati city and intercity private operators |
| GTFS | Unknown |
| Ferry | Inland water transport sources should be tracked separately |
| Scraping | Medium |
| Adapter | `astc` |
| Priority | P2 |
| Notes | Ferry plus bus coverage makes multimodal modeling important. |

### Bihar

| Category | Sources |
| --- | --- |
| Government | Bihar State Road Transport Corporation and transport department candidates |
| Private | District bus operators and booking portals |
| GTFS | Unknown |
| Scraping | Medium |
| Adapter | `bsrtc` |
| Priority | P2 |
| Notes | Start with Patna and major intercity corridors. |

### Chhattisgarh

| Category | Sources |
| --- | --- |
| Government | State transport department candidates |
| Private | Private bus operators dominate many corridors |
| GTFS | Unknown |
| Scraping | Hard |
| Adapter | `chhattisgarh-transport` |
| Priority | P3 |
| Notes | Requires operator mapping by district. |

### Goa

| Category | Sources |
| --- | --- |
| Government | Kadamba Transport Corporation candidates |
| Private | Local bus associations |
| GTFS | Unknown |
| Ferry | River ferry sources should be tracked |
| Scraping | Medium |
| Adapter | `ktcl-goa` |
| Priority | P2 |
| Notes | Tourist and ferry use cases are important. |

### Gujarat

| Category | Sources |
| --- | --- |
| Government | GSRTC, Ahmedabad BRTS, city bus agencies |
| Private | City and intercity operators |
| GTFS | Candidate for city systems; verify |
| Scraping | Medium |
| Adapter | `gsrtc` |
| Priority | P1 |
| Notes | Ahmedabad, Surat, Vadodara, Rajkot should be separate city coverage units. |

### Haryana

| Category | Sources |
| --- | --- |
| Government | Haryana Roadways and state transport department candidates |
| Private | NCR private/city operators |
| GTFS | Unknown |
| Scraping | Medium |
| Adapter | `haryana-roadways` |
| Priority | P2 |
| Notes | Integrate with Delhi NCR coverage. |

### Himachal Pradesh

| Category | Sources |
| --- | --- |
| Government | HRTC candidates |
| Private | Hill route operators |
| GTFS | Unknown |
| Scraping | Medium |
| Adapter | `hrtc` |
| Priority | P2 |
| Notes | Terrain-aware travel time confidence matters. |

### Jharkhand

| Category | Sources |
| --- | --- |
| Government | State transport department candidates |
| Private | Intercity private operators |
| GTFS | Unknown |
| Scraping | Hard |
| Adapter | `jharkhand-transport` |
| Priority | P3 |
| Notes | Likely community-heavy outside Ranchi and Jamshedpur. |

### Karnataka

| Category | Sources |
| --- | --- |
| Government | KSRTC, BMTC, NWKRTC, KKRTC candidates |
| Metro | Bengaluru Metro sources |
| Private | Intercity booking portals require legal review |
| GTFS | Candidate; verify official static/realtime availability |
| Scraping | Medium |
| Adapter | `bmtc`, `ksrtc-karnataka`, `nwkrtc`, `kkrtc` |
| Priority | P0 |
| Notes | Split Bengaluru city bus, metro, and statewide/intercity buses. |

### Kerala

| Category | Sources |
| --- | --- |
| Government | KSRTC Kerala, Kochi Metro, Kochi Water Metro candidates |
| Private | Strong private bus network |
| GTFS | Candidate for metro/water metro; verify |
| Ferry | High priority |
| Scraping | Medium |
| Adapter | `kerala-rtc`, `kochi-metro`, `kochi-water-metro` |
| Priority | P1 |
| Notes | Needs a mixed official plus community strategy for private buses. |

### Madhya Pradesh

| Category | Sources |
| --- | --- |
| Government | MP Transport and city bus/BRTS candidates |
| Private | Intercity operators |
| GTFS | Unknown |
| Scraping | Medium |
| Adapter | `mp-transport` |
| Priority | P1 |
| Notes | Start with Indore, Bhopal, Jabalpur, Gwalior. |

### Maharashtra

| Category | Sources |
| --- | --- |
| Government | MSRTC, BEST, Pune Mahanagar Parivahan, metro agencies |
| Private | Large intercity private network |
| GTFS | Candidate for Mumbai/Pune/metro sources; verify |
| Scraping | Medium |
| Adapter | `msrtc`, `best`, `pmpml` |
| Priority | P1 |
| Notes | Model Mumbai suburban rail and metro as separate provider lanes. |

### Manipur

| Category | Sources |
| --- | --- |
| Government | State transport department candidates |
| Private | Local and intercity operators |
| GTFS | Unknown |
| Scraping | Hard |
| Adapter | `manipur-transport` |
| Priority | P3 |
| Notes | Start with Imphal source discovery. |

### Meghalaya

| Category | Sources |
| --- | --- |
| Government | State transport department candidates |
| Private | Shared taxi and bus operators |
| GTFS | Unknown |
| Scraping | Hard |
| Adapter | `meghalaya-transport` |
| Priority | P3 |
| Notes | Community verification likely central. |

### Mizoram

| Category | Sources |
| --- | --- |
| Government | State transport department candidates |
| Private | Local operators |
| GTFS | Unknown |
| Scraping | Hard |
| Adapter | `mizoram-transport` |
| Priority | P3 |
| Notes | District-first research needed. |

### Nagaland

| Category | Sources |
| --- | --- |
| Government | State transport department candidates |
| Private | Shared taxi and local bus operators |
| GTFS | Unknown |
| Scraping | Hard |
| Adapter | `nagaland-transport` |
| Priority | P3 |
| Notes | Community and manual depot data likely required. |

### Odisha

| Category | Sources |
| --- | --- |
| Government | Odisha OPTICS, OSRTC, city bus sources |
| Private | Intercity bus operators |
| GTFS | Unknown |
| Scraping | Medium |
| Adapter | `optics-odisha`, `osrtc` |
| Priority | P0 |
| Notes | Named priority. Verify OPTICS APIs, licensing, and source ownership. |

### Punjab

| Category | Sources |
| --- | --- |
| Government | PRTC, Punjab Roadways candidates |
| Private | Intercity operators |
| GTFS | Unknown |
| Scraping | Medium |
| Adapter | `prtc-punjab`, `punjab-roadways` |
| Priority | P2 |
| Notes | Include Chandigarh tri-city overlap. |

### Rajasthan

| Category | Sources |
| --- | --- |
| Government | RSRTC candidates |
| Private | Intercity and tourist routes |
| GTFS | Unknown |
| Scraping | Medium |
| Adapter | `rsrtc` |
| Priority | P2 |
| Notes | Jaipur city transport and metro should be separate candidates. |

### Sikkim

| Category | Sources |
| --- | --- |
| Government | SNT and state transport candidates |
| Private | Shared taxi networks |
| GTFS | Unknown |
| Scraping | Hard |
| Adapter | `snt` |
| Priority | P3 |
| Notes | Terrain and sparse schedule modeling needed. |

### Tamil Nadu

| Category | Sources |
| --- | --- |
| Government | TNSTC, SETC, MTC Chennai, Chennai Metro candidates |
| Private | Intercity operators |
| GTFS | Candidate for metro/city feeds; verify |
| Scraping | Medium |
| Adapter | `tnstc`, `setc`, `mtc-chennai` |
| Priority | P1 |
| Notes | Split Chennai city and statewide corporation networks. |

### Telangana

| Category | Sources |
| --- | --- |
| Government | TSRTC and Hyderabad Metro candidates |
| Private | Intercity operators |
| GTFS | Candidate for metro; verify |
| Scraping | Medium |
| Adapter | `tsrtc`, `hyderabad-metro` |
| Priority | P1 |
| Notes | Hyderabad first, then statewide routes. |

### Tripura

| Category | Sources |
| --- | --- |
| Government | TRTC and state transport candidates |
| Private | Local private operators |
| GTFS | Unknown |
| Scraping | Hard |
| Adapter | `trtc` |
| Priority | P3 |
| Notes | Start with Agartala and district corridors. |

### Uttar Pradesh

| Category | Sources |
| --- | --- |
| Government | UPSRTC, city bus agencies, metro agencies |
| Private | Intercity private operators |
| GTFS | Candidate for metro/city sources; verify |
| Scraping | Medium |
| Adapter | `upsrtc` |
| Priority | P1 |
| Notes | Very large network; prioritize Lucknow, Noida/Ghaziabad, Kanpur, Varanasi, Prayagraj. |

### Uttarakhand

| Category | Sources |
| --- | --- |
| Government | UTC candidates |
| Private | Hill route operators |
| GTFS | Unknown |
| Scraping | Medium |
| Adapter | `utc` |
| Priority | P2 |
| Notes | Hill routing and seasonal variation matter. |

### West Bengal

| Category | Sources |
| --- | --- |
| Government | WBTC, NBSTC, SBSTC, state transport candidates |
| Private | WBBus and private route sources |
| Metro | Kolkata Metro sources |
| GTFS | Unknown; verify metro/static feeds |
| Scraping | Easy to Medium for WBBus; unknown for government sources |
| Adapter | `wbbus`, `wbtc`, `nbstc`, `sbstc` |
| Priority | P0 |
| Notes | Current implementation focus. Use community verification for Kolkata route/stoppage gaps. |

## Union Territories

### Andaman and Nicobar Islands

| Category | Sources |
| --- | --- |
| Government | UT transport department, ferry/shipping sources |
| GTFS | Unknown |
| Ferry | High priority |
| Scraping | Medium |
| Adapter | `andaman-transport`, `andaman-ferry` |
| Priority | P3 |
| Notes | Ferry schedules are central to useful coverage. |

### Chandigarh

| Category | Sources |
| --- | --- |
| Government | CTU candidates |
| Private | Tri-city operators |
| GTFS | Unknown |
| Scraping | Medium |
| Adapter | `ctu` |
| Priority | P2 |
| Notes | Integrate with Punjab and Haryana. |

### Dadra and Nagar Haveli and Daman and Diu

| Category | Sources |
| --- | --- |
| Government | UT transport department candidates |
| Private | Regional operators |
| GTFS | Unknown |
| Scraping | Hard |
| Adapter | `dnh-dd-transport` |
| Priority | P3 |
| Notes | Treat as a later coverage unit unless user demand appears. |

### Delhi

| Category | Sources |
| --- | --- |
| Government | Delhi Open Transit Data: https://otd.delhi.gov.in/documentation/ |
| Metro | DMRC static data is referenced by Delhi OTD |
| Private | NCR private operators require legal review |
| GTFS | Known for Delhi bus static data through OTD; realtime requires authorized key |
| Scraping | Easy for static feed; API authorization needed for realtime |
| Adapter | `delhi-otd` |
| Priority | P0 |
| Notes | Strong early expansion candidate because OTD documents GTFS-style files. |

### Jammu and Kashmir

| Category | Sources |
| --- | --- |
| Government | JKSRTC and transport department candidates |
| Private | Regional operators |
| GTFS | Unknown |
| Scraping | Medium |
| Adapter | `jksrtc` |
| Priority | P3 |
| Notes | Validate current corporation/source structure before implementation. |

### Ladakh

| Category | Sources |
| --- | --- |
| Government | UT transport and district sources |
| Private | Seasonal/local operators |
| GTFS | Unknown |
| Scraping | Hard |
| Adapter | `ladakh-transport` |
| Priority | P3 |
| Notes | Seasonal availability and road closures are important. |

### Lakshadweep

| Category | Sources |
| --- | --- |
| Government | UT transport and shipping sources |
| Ferry | High priority |
| GTFS | Unknown |
| Scraping | Hard |
| Adapter | `lakshadweep-ferry` |
| Priority | P3 |
| Notes | Ferry and ship schedules are more important than road transit. |

### Puducherry

| Category | Sources |
| --- | --- |
| Government | PRTC candidates |
| Private | Regional bus operators |
| GTFS | Unknown |
| Scraping | Medium |
| Adapter | `prtc-puducherry` |
| Priority | P2 |
| Notes | Integrate with Tamil Nadu corridors. |
