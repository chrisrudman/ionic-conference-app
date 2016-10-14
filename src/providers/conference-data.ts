import { Injectable } from '@angular/core';

import { Http } from '@angular/http';

import { UserData } from './user-data';


@Injectable()
export class ConferenceData {
  data: any;

  constructor(public http: Http, public user: UserData) { }

  /*  METHOD: load()
      This method returns an organised data object, which has been loaded form the 
      local file and parsed to re-arrange the data into more meaningful object structure.
  
      It returns a Promise - if the data has already been read/parsed then it immediately returns
      the cahced data for performance reasons.
  */
  load() {
    if (this.data) {
      // already loaded data
      return Promise.resolve(this.data);
    }

    // don't have the data yet
    return new Promise(resolve => {
      // We're using Angular Http provider to request the data,
      // then on the response it'll map the JSON data to a parsed JS object.
      // Next we process the data and resolve the promise with the new data.
      this.http.get('assets/data/data.json').subscribe(res => {
        // we've got back the raw data, now generate the core schedule data
        // and save the data for later reference

        /* NOTE - most other examples I've seen use the RxJS map function before the subscribe,
              eg: http.get(url).map(res => return res.json)
        */
        this.data = this.processData(res.json());
        resolve(this.data);
      });
    });
  }



  /*  METHOD: processData()
      Called from load(). It parses the raw data.
        - schedule[] - contains only 1 object for a single DAY:
            date
            groups[] - used to control the grouping for the list, divided by TIMESLOT
              time
              sessions[]
                name
                description
                speakerNames[] - which speakers involved in session?
                timestart
                timeend
                location
                tracks[]  - even though this is an array, there is only ONE track/session
  
        - speakers[]
            name
            profilePic
            twitter
            about
            location
            email
            phone
  
        - map[]
            name
            lat
            long
            centre
  
  
  
      It adds:
      * a new Tracks array - contains distinct list of all tracks mentioned in sessions
  */
  processData(data) {
    // just some good 'ol JS fun with objects and arrays
    // build up the data by linking speakers to sessions

    data.tracks = [];

    // loop through each day in the schedule
    data.schedule.forEach(day => {
      // loop through each timeline group in the day
      day.groups.forEach(group => {
        // loop through each session in the timeline group
        group.sessions.forEach(session => {
          this.processSession(data, session);
        });
      });
    });

    return data;
  }



  /*  METHOD: processSession
      Called from processData(), when looping through sessions in raw data.
  
      loops through each session: 
        - adds an array of speaker objects to session object (instead of just name)
        - adds an array of session objects to each speaker object
        - adds any new tracks into the Tracks array
  
  */
  processSession(data, session) {
    // loop through each speaker and load the speaker data
    // using the speaker name as the key
    session.speakers = [];
    if (session.speakerNames) {
      session.speakerNames.forEach(speakerName => {
        let speaker = data.speakers.find(s => s.name === speakerName);
        if (speaker) {
          session.speakers.push(speaker);
          speaker.sessions = speaker.sessions || [];
          speaker.sessions.push(session);
        }
      });
    }

    /* if any tracks are listed then loop through them and add to the Track[] if it doesnt already exist*/
    if (session.tracks) {
      session.tracks.forEach(track => {
        if (data.tracks.indexOf(track) < 0) {
          data.tracks.push(track);
        }
      });
    }
  }




  /*  METHOD: getTimeline(), returns the data with all appropriate filters applied
      This is the MAIN ENTRY POINT called by the app. It invokes all other methods here.
  
      For the specified DAY (there is only 1 in data), go through each Group (ie each list header)
      - set group.hide flag to true
      - go through each session in group 
        - check all filters, and set .hide flag appropriately
        - if the session is to be shown (ie hide = false) then unhide the group header, increment shownSession counter
  */
  getTimeline(dayIndex, queryText = '', excludeTracks = [], segment = 'all') {
    return this.load().then(data => {
      let day = data.schedule[dayIndex];
      day.shownSessions = 0;

      queryText = queryText.toLowerCase().replace(/,|\.|-/g, ' ');
      let queryWords = queryText.split(' ').filter(w => !!w.trim().length);  //TODO - what does !! mean?

      day.groups.forEach(group => {
        group.hide = true;

        group.sessions.forEach(session => {
          // check if this session should show or not
          this.filterSession(session, queryWords, excludeTracks, segment);

          if (!session.hide) {
            // if this session is not hidden then this group should show
            group.hide = false;
            day.shownSessions++;
          }
        });

      });

      return day;
    });
  }



  /*  METHOD filterSessions(), checks a supplied session for 3 filter types.
      Pass is a session and it is compared with three types of fitler:
        - the searchbar lst of queried words
        - the list of excluded tracks
        - is this a user favorite and is the segment set to 'favorites'?

      If all of these fail then the session.hide flag is set to true, which is 
      then parsed by above function to set the group header's .hide flag.
  */
  filterSession(session, queryWords, excludeTracks, segment) {

    let matchesQueryText = false;
    if (queryWords.length) {
      // of any query word is in the session name than it passes the query test
      queryWords.forEach(queryWord => {
        if (session.name.toLowerCase().indexOf(queryWord) > -1) {
          matchesQueryText = true;
        }
      });
    } else {
      // if there are no query words then this session passes the query test
      matchesQueryText = true;
    }

    // if any of the sessions tracks are not in the
    // exclude tracks then this session passes the track test
    let matchesTracks = false;
    session.tracks.forEach(trackName => {
      if (excludeTracks.indexOf(trackName) === -1) {
        matchesTracks = true;
      }
    });

    // if the segement is 'favorites', but session is not a user favorite
    // then this session does not pass the segment test
    let matchesSegment = false;
    if (segment === 'favorites') {
      if (this.user.hasFavorite(session.name)) {
        matchesSegment = true;
      }
    } else {
      matchesSegment = true;
    }

    // all tests must be true if it should not be hidden
    session.hide = !(matchesQueryText && matchesTracks && matchesSegment);
  }



  /*  METHOD: getSpeakers(), returns the list of speakers, sorted by surname.
      Because the data is got via load() then each speaker object will also contain an array of sessions
  */
  getSpeakers() {
    return this.load().then(data => {
      return data.speakers.sort((a, b) => {
        let aName = a.name.split(' ').pop();    /* I like this trick of pop to get the last name*/
        let bName = b.name.split(' ').pop();
        return aName.localeCompare(bName);
      });
    });
  }



  /*  METHOD: getTracks(), returns the list of tracks, sorted by name.
  */
  getTracks() {
    return this.load().then(data => {
      return data.tracks.sort();
    });
  }



  /*  METHOD: getMap(), returns the list of map pins.
  */
  getMap() {
    return this.load().then(data => {
      return data.map;
    });
  }

}
