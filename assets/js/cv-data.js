/*
 * The professional record. One file, one source of truth.
 *
 * This is a curriculum vitae, not a production record. It deliberately carries
 * NO practice financials: no revenue, no assets under management, no production
 * or premium credit, no book values, no client counts. Those figures belong on
 * the firm-specific paperwork that goes to one recipient, not on a page that
 * gets forwarded. If a figure of that kind is ever added here, it is a mistake.
 *
 * Nothing is hard-coded into index.html. To change the CV, change this file.
 */

window.CV = (function () {
  /* A field is a value plus an optional note explaining it. */
  const f = (v, note) => ({ v, note });

  return {
    meta: {
      subject: 'Rebecca M. Gustafson',
      asOf: 'September 2026',
      note:
        'Prepared as a professional record. It carries no client information ' +
        'and no practice financials — no revenue, assets under management or ' +
        'production figures appear anywhere on this page. Designation status ' +
        'and registration history are verifiable electronically through FINRA.'
    },

    /* ---------------------------------------------------------------- bio */

    bio: {
      name: 'Becky Gustafson',
      legalName: 'Rebecca M. Gustafson',
      title: 'Wealth Management Advisor',
      practice: 'Eternal Wealth Partners',
      positioning: 'Fee and values based wealth management for business owners',
      lede:
        'I work with people who run successful businesses and love their ' +
        'families. For them the company and the household are one financial ' +
        'life, not two, and I plan them as one.',
      body: [
        'I am an estate and business planning specialist first: a CERTIFIED ' +
          'FINANCIAL PLANNER™ professional with a master’s in financial ' +
          'planning and a credential set built around exit, estate, charitable ' +
          'and retirement planning. I practice as Eternal Wealth Partners, a fee ' +
          'and values based firm for owners and the families who depend on them. ' +
          'My clients want the things I am built to help them reach: to scale ' +
          'what they have created, to plan wiser as it grows, and to position ' +
          'themselves well for the transition or exit that eventually comes.',

        'The work runs on a methodology I built, and its discipline has a human ' +
          'purpose: to make sure nothing about a family’s life slips through ' +
          'the gaps between silos. My Seven Pillars continuum treats a ' +
          'household’s full picture as one moving system rather than seven ' +
          'separate engagements: protection, cash flow, tax position, investment ' +
          'structure, business value, exit readiness and legacy. Every quarter ' +
          'the plan is recalibrated rather than restarted, moving as decisions ' +
          'get made and priorities re-sequence to match where the family now ' +
          'stands. I coordinate rather than quarterback, working from the wealth ' +
          'advisor’s seat while the CPA, the attorney and the valuation ' +
          'professional keep their own, and my Exit Team Alignment layer keeps an ' +
          'owner’s whole team moving together rather than in parallel. For the ' +
          'person across the table, that is the difference between a plan on ' +
          'paper and a plan that holds when life actually changes.',

        'Nineteen years in, one firm my entire career, I have built a practice I ' +
          'am proud of, and I am grateful for the foundation that made it ' +
          'possible. I am also clear about what comes next, and I do not want to ' +
          'build it alone. A real reason I am moving is collaboration: I want to ' +
          'work on a team of advisors and specialists who think shoulder to ' +
          'shoulder, where the hard cases get more than one mind and every client ' +
          'is better for it. I am not looking for somewhere to land. I am looking ' +
          'for the right people to build with.'
      ],
      pullQuote:
        'You can’t optimize the portfolio and ignore the business that funds ' +
        'it. For my clients, that’s one balance sheet.'
    },

    /* At a glance. Scope and standing only — nothing here is a figure about
       money, and nothing here should become one. */
    glance: [
      ['Practice', 'Eternal Wealth Partners', 'Fee and values based, New Orleans'],
      ['Role', 'Wealth Management Advisor', 'Principal'],
      ['Experience', '19 years', 'One firm, entire career'],
      ['Credentials', '11 designations', 'Plus a master’s in financial planning'],
      ['Licensed', '13 states', 'Insurance and securities alike']
    ],

    /* ------------------------------------------------------- credentials */

    /* Becky's own order. This is how the credentials are signed, so it is the
       order they appear in everywhere on this page — the marks line under her
       name and the card grid. Do not re-sort, and do not single any of them
       out: every card carries a mark and a name and nothing else, which is
       what keeps the grid even. */
    credentials: [
      { mark: 'CFP®', name: 'CERTIFIED FINANCIAL PLANNER™' },
      { mark: 'CEPA®', name: 'Certified Exit Planning Advisor' },
      { mark: 'MSFP', name: 'Master of Science in Financial Planning', degree: true },
      { mark: 'AEP®', name: 'Accredited Estate Planner' },
      { mark: 'CAP®', name: 'Chartered Advisor in Philanthropy' },
      { mark: 'ChFC®', name: 'Chartered Financial Consultant' },
      { mark: 'CLU®', name: 'Chartered Life Underwriter' },
      { mark: 'RICP®', name: 'Retirement Income Certified Professional' },
      { mark: 'CASL®', name: 'Chartered Advisor for Senior Living' },
      { mark: 'LUTCF®', name: 'Life Underwriter Training Council Fellow' },
      { mark: 'CLTC®', name: 'Certified in Long-Term Care' }
    ],

    credentialNote:
      'Eleven professional designations spanning financial planning, estate, ' +
      'charitable, retirement, long-term care and exit planning, alongside a ' +
      'master’s in financial planning. Designation status is verified ' +
      'electronically through FINRA.',

    education: {
      masters: f(
        'MSFP — Master of Science in Financial Planning',
        'The academic foundation under the designation set, and the reason the ' +
        'planning work goes deeper than any one credential’s curriculum.'
      ),
      executive: f(
        'Goldman Sachs 10,000 Small Businesses — Graduate, Cohort 20',
        'Delgado / Greater New Orleans, 2018. An owner’s programme, taken ' +
        'as an owner rather than as an advisor to owners.'
      )
    },

    /* --------------------------------------------------------- licensing */

    licensing: {
      finraSeries: f(
        'SIE, Series 7, Series 6, Series 63',
        'Verifiable through FINRA BrokerCheck.'
      ),
      iarBasis: f(
        'ChFC® — Louisiana',
        'No Series 65 or 66 is held. The investment adviser representative ' +
        'registration runs on the ChFC® designation, which Louisiana accepts in ' +
        'lieu of the examination. Worth reading alongside the thirteen-state ' +
        'line above rather than against it: broker registration follows where ' +
        'business is transacted, while IAR registration for a federally covered ' +
        'adviser follows place of business — one state, because there is one ' +
        'office.'
      ),
      insuranceStates: f(
        '13 states',
        'Louisiana resident, plus twelve non-resident states. Listed in full below.'
      ),
      securitiesStates: f(
        '13 states',
        'The same thirteen states as the insurance licence. Both footprints are ' +
        'listed in full below.'
      ),
      currentlyAffiliated: f(
        'Northwestern Mutual',
        'Securities through Northwestern Mutual Investment Services; advisory ' +
        'through Northwestern Mutual Wealth Management Company.'
      ),
      territory: f(
        'Louisiana, Mississippi and Arkansas',
        'The solicitation territory under the current agent contract: the State ' +
        'of Louisiana in full; 60 named counties in Mississippi; and Ashley, ' +
        'Chicot, Desha and Drew counties in Arkansas. Territory is separate ' +
        'from, and narrower than, the thirteen-state licence footprint.'
      )
    },

    /* The insurance licence footprint. Louisiana is the resident state; the
       rest are non-resident. Order is resident first, then alphabetical. */
    licenceStates: {
      resident: 'Louisiana',
      nonResident: [
        'Alabama', 'Colorado', 'Florida', 'Georgia', 'Indiana', 'Michigan',
        'Minnesota', 'Mississippi', 'Nebraska', 'New York', 'Oregon', 'Texas'
      ],
      covers: 'Insurance licence and securities registration — the same thirteen',
      note:
        'Thirteen states, insurance and securities alike. A footprint this wide ' +
        'is what lets a practice follow its clients rather than its postcode — ' +
        'business owners relocate, sell and retire out of state, and the ' +
        'relationship does not have to end when they do.'
    },

    /* ---------------------------------------------------------- practice */

    practiceNote:
      'Nineteen years with one firm, the last eight of them building Eternal ' +
      'Wealth Partners inside it. The practice is described here by what it ' +
      'does and how it is staffed; figures about the book are supplied ' +
      'separately, on the paperwork that asks for them.',

    career: {
      registered: f('March 2, 2007', 'Date first registered'),
      years: f('19 years', 'Continuous, in the same career'),
      history: f(
        'One firm, entire career',
        'The whole record sits with Northwestern Mutual and its affiliates — ' +
        'no prior broker-dealer, no intervening firms.'
      ),
      role: f('Wealth Management Advisor', 'Current title'),
      contractEffective: f(
        'January 1, 2018',
        'Date of the current agent contract, and the year Eternal Wealth ' +
        'Partners took its present shape.'
      )
    },

    firm: {
      name: f('Eternal Wealth Partners', 'The practice name'),
      position: f('Principal'),
      model: f(
        'Fee and values based',
        'Built for business owners and the families who depend on them.'
      ),
      clients: f(
        'Business owners and their households',
        'The company and the household planned as one financial life rather ' +
        'than two.'
      ),
      location: f('New Orleans, Louisiana', 'One office, serving thirteen states')
    },

    specialisations: [
      { name: 'Business and exit planning',
        note: 'Exit readiness, value drivers, and the alignment of an owner’s whole advisory team. CEPA®.' },
      { name: 'Estate planning',
        note: 'Transfer, structure and legacy, coordinated with the drafting attorney. AEP®.' },
      { name: 'Charitable and philanthropic planning',
        note: 'Giving built into the plan rather than bolted onto it. CAP®.' },
      { name: 'Retirement income',
        note: 'Turning an accumulated balance sheet into income that lasts. RICP®.' },
      { name: 'Comprehensive financial planning',
        note: 'The Seven Pillars continuum, recalibrated quarterly. CFP®, MSFP.' },
      { name: 'Risk, protection and long-term care',
        note: 'What holds the plan together when a life changes shape. CLU®, CLTC®, CASL®.' }
    ],

    team: [
      {
        name: 'Madison Naugher',
        role: 'Director of Operations',
        note:
          'Runs the operating side of the practice — client service, process ' +
          'and the quarterly recalibration cycle that the methodology depends on.'
      }
    ],

    oba: {
      framing:
        'Listed because it requires outside-business-activity disclosure, not ' +
        'because it forms part of the practice.',
      items: [
        {
          name: 'Technology venture',
          role: 'Co-founder',
          what:
            'Unrelated to financial services. No securities activity, no ' +
            'insurance activity, no client assets and no client relationships ' +
            'in common with the practice.',
          status: 'Disclosed for compliance review.'
        }
      ]
    },

    /* ------------------------------------------------------------ method */

    method: {
      title: 'The Seven Pillars',
      note:
        'A methodology built in-house, and the reason the planning holds ' +
        'together. It treats a household’s full picture as one moving ' +
        'system rather than seven separate engagements.',
      pillars: [
        { name: 'Protection', what: 'What holds when a life changes shape.' },
        { name: 'Cash flow', what: 'What the household and the company actually run on.' },
        { name: 'Tax position', what: 'Planned across years, not reacted to each spring.' },
        { name: 'Investment structure', what: 'Built to serve the plan rather than to be the plan.' },
        { name: 'Business value', what: 'The largest asset on most of these balance sheets.' },
        { name: 'Exit readiness', what: 'Long before the transaction, so the options stay open.' },
        { name: 'Legacy', what: 'What compounds for the generation that comes next.' }
      ],
      body: [
        'Every quarter the plan is recalibrated rather than restarted, moving ' +
          'as decisions get made and priorities re-sequence to match where the ' +
          'family now stands.',
        'I coordinate rather than quarterback, working from the wealth ' +
          'advisor’s seat while the CPA, the attorney and the valuation ' +
          'professional keep their own. The Exit Team Alignment layer keeps an ' +
          'owner’s whole team moving together rather than in parallel — which ' +
          'is the difference between a plan on paper and a plan that holds when ' +
          'life actually changes.'
      ]
    },

    /* ------------------------------------------------------- recognition */

    /* Third-party standing. Two of the awards are the firm's rather than
       Becky's, and are marked so — a reviewer who checks will find them listed
       under Eternal Wealth Partners, and conflating the two would be the kind
       of small inaccuracy that costs more than the award is worth. */
    recognition: {
      note:
        'Standing as assessed by people other than the practice: national and ' +
        'regional rankings, invited speaking, and elected or founded leadership ' +
        'roles. Two of the awards were made to Eternal Wealth Partners rather ' +
        'than to Becky personally, and are marked as such.',

      rankings: [
        { year: '2026', title: 'Forbes Best-in-State Financial Security Professionals',
          detail: 'No. 20. Forbes / SHOOK.', ranked: true },
        { year: '2025', title: 'Forbes Best-in-State Financial Security Professionals',
          detail: 'No. 19 in Louisiana. Forbes / SHOOK; awarded July 2025, data period 12/31/2023 to 12/31/2024.',
          ranked: true },
        { year: '2026', title: 'Biz New Orleans 500, 5th edition',
          detail: 'Class of 2026. “Influential, Involved and Inspiring Executives.”' },
        { year: '2025', title: 'Biz New Orleans 500, 4th edition',
          detail: '“Influential, Involved and Inspiring Executives.”' },
        { year: '2026', title: 'CityBusiness Empowering Women', detail: 'Honoree.' },
        { year: '2024', title: 'CityBusiness Women of the Year' },
        { year: '2019', title: 'CityBusiness Money Makers', detail: 'Investment.' },
        { year: '2017', title: 'CityBusiness Women of the Year' },
        { year: '2026', title: 'CityBusiness “In the Lead: Best Women-Owned Businesses”',
          detail: 'Awarded to Eternal Wealth Partners.', scope: 'firm' },
        { year: '2026', title: 'New Orleans Readers’ Favorite Wealth Manager',
          detail: 'Awarded to Eternal Wealth Partners.', scope: 'firm' },
        { year: '2015', title: 'Faces of New Orleans', detail: 'Honoree, benefiting March of Dimes.' }
      ],

      speaking: [
        { year: '2026', title: 'Power Up: Women’s Leadership Conference, 7th annual',
          detail: 'Co-presenter, “From Hustler to CEO.”' },
        { year: '2026', title: 'Northwestern Mutual Southern Regional PGA Luncheon',
          detail: 'Speaker.' },
        { year: '2025', title: 'Power Up: Women’s Leadership Conference, 6th annual',
          detail: 'Co-presenter, “Take Control of Your Exit Strategy.”' },
        { year: '2025', title: 'Biz New Orleans, Inside the Industry', detail: 'Featured expert.' },
        { year: '2024', title: 'Biz New Orleans podcast, episode 156',
          detail: 'Guest, “Financial Freedom for All.”' },
        { year: '2023', title: 'Biz New Orleans Economic Development',
          detail: 'Presenter, “Mapping Your Business to the Next Generation.”' },
        { year: '2023', title: 'Biz Talks New Orleans podcast',
          detail: 'Guest, LGBTQ+ retirement planning, Pride Month episode.' },
        { year: '2019', title: 'Power Up: Women’s Leadership Conference, inaugural',
          detail: 'Breakfast keynote. New Orleans Chamber Foundation.' },
        { year: '2019', title: 'New Orleans Magazine', detail: 'Featured, wealth management.' },
        { year: '2019', title: 'Women in Construction Conference',
          detail: 'Panelist. NAWBO New Orleans with the Urban League of Louisiana.' }
      ],

      leadership: [
        { year: '2019–20', title: 'NAWBO New Orleans', detail: 'President.' },
        { year: '2013–23', title: 'Power of Women (POW)',
          detail: 'Founder and president for nearly a decade. An invitation-only peer advisory group for women business owners.' },
        { year: '2018', title: 'Goldman Sachs 10,000 Small Businesses',
          detail: 'Graduate, Cohort 20. Delgado / Greater New Orleans.' }
      ],

      rankingDisclosure:
        'Forbes Best-in-State Financial Security Professionals is developed by ' +
        'SHOOK Research and based on an algorithm of qualitative and ' +
        'quantitative data, including in-depth interviews and information from ' +
        'industry sources. Advisors do not pay a fee to be considered or ' +
        'included. Neither Forbes nor SHOOK Research receives compensation in ' +
        'connection with the ranking. The ranking is not indicative of future ' +
        'performance, is not an endorsement, and may not be representative of ' +
        'any one client’s experience.'
    },

    /* ------------------------------------------------------------ vision */

    /* Carried over from the profile build. The growth target that used to open
       the second paragraph was a figure about assets, so it is gone; what it
       was there to say — that the ambition is about depth rather than
       headcount — is said directly instead. */
    vision: {
      question: 'What is your vision for your practice, your clients and your areas of specialisation for the next five years?',
      paragraphs: [
        'The next five years are about building a fractional family office in ' +
          'the fullest sense of the term, and building it with a team. Done ' +
          'right, one owner relationship carries a family through the years of ' +
          'growth, through the sale or handoff of the business, and into a legacy ' +
          'that compounds for the next generation. That is deep work and it is ' +
          'human work: protection, tax, estate and retirement income all at once, ' +
          'bound up in the company someone gave their life to, and none of it ' +
          'yields to being handled one silo at a time. Doing that well, for ' +
          'people who have trusted me with what they built, is the work I love ' +
          'and the work I want more of, for more owners, at a higher level.',

        'My ambition is specific and large, and it is an ambition about depth ' +
          'rather than headcount. A relationship served this completely is worth ' +
          'many times a conventional one, and growth of that kind is not a ' +
          'marketing exercise. It is what happens when the planning is good ' +
          'enough that owners send the people they respect, and when a real team ' +
          'gives me the capacity to take them on without ever thinning the care. ' +
          'Fewer, larger, deeper relationships, carried by more than one good ' +
          'mind — that is how the practice grows while I move closer to my ' +
          'clients rather than further away.',

        'What I want in a firm follows from that. A platform built for this kind ' +
          'of planning rather than beside it. A fee-based direction the grid and ' +
          'the technology actually reward and carry, because recurring revenue is ' +
          'what makes a practice an asset instead of a job that starts over every ' +
          'January. The capacity and infrastructure to grow a real team. And more ' +
          'than any single feature, people to build with: advisors and staff who ' +
          'love the craft and want to trade ideas on hard cases, so every client ' +
          'gets better thinking than any one of us could give alone.',

        'Underneath all of it my objective is simple and personal: to do great ' +
          'planning for great people, and to build something of lasting value ' +
          'that outlives my seat at the table.'
      ]
    },

    /* ----------------------------------------------------------- contact */

    contact: {
      email: f('becky@siliconbayou.ai'),
      phone: f('985-290-6745'),
      location: f('New Orleans, Louisiana 70124'),
      practice: f('Eternal Wealth Partners')
    },

    identifiers: {
      legalName: f('Rebecca M. Gustafson'),
      knownAs: f('Becky Gustafson'),
      crd: f('5303056', 'Verifiable through FINRA BrokerCheck'),
      designations: f('11, plus MSFP', 'Status verified electronically through FINRA')
    }
  };
})();
