// Edit these to change site-wide details. Photos/video can be swapped by
// dropping files into public/media (see public/media/README.md).
module.exports = {
  name: '10kB2B',
  tagline: 'Greater New Orleans Business Collective',
  meeting: {
    cadence: 'Second Tuesday of every month',
    time: '11:30 AM',
    venue: process.env.MEETING_VENUE || 'A partner restaurant in Greater New Orleans',
    venueNote: 'Seated lunch — members receive the venue details in the Member Portal.',
  },
  contactEmail: process.env.CONTACT_EMAIL || '',
  media: {
    // Local files win if present; remote stock fallbacks keep the site polished out of the box.
    heroVideo: ['/media/hero-loop.mp4'],
    heroPoster: 'https://images.unsplash.com/photo-1556761175-b413da4baf72?auto=format&fit=crop&w=2000&q=80',
    table: 'https://images.unsplash.com/photo-1552664730-d307ca884978?auto=format&fit=crop&w=1400&q=80',
    restaurant: 'https://images.unsplash.com/photo-1517248135467-4c7edcad34c4?auto=format&fit=crop&w=1600&q=80',
    dining: 'https://images.unsplash.com/photo-1414235077428-338989a2e8c0?auto=format&fit=crop&w=1400&q=80',
    handshake: 'https://images.unsplash.com/photo-1521737604893-d14cc237f11e?auto=format&fit=crop&w=1400&q=80',
    team: 'https://images.unsplash.com/photo-1600880292203-757bb62b4baf?auto=format&fit=crop&w=1400&q=80',
  },
};
