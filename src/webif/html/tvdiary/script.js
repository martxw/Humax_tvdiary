/*
 * TV Diary main display page scripts.
 * Author: Martin Wink, 2013.
 */

// Declare globals
// day_start comes from calendar_params.js/jim

// Today's calendar date start. Updated each request_update().
var today_start = 0;

// Whether live broadcasts are to be displayed. Toggled on and off.
var including_live = true;

// Start time for the displayed details, with the day_start offset included. Changed by the datepicker.
var display_start;
var display_end;

// While awaiting Ajax responses.
var isBusyR = false;
var isBusyW = false;

function log_stuff(x) { /*console.log(x);*/ }

$(document).ready(function() {

  // Initialize the to-top scroller.
  $().UItoTop({easingType: 'easeOutQuart'});
  $('.backtotop').click(function() {
    $('html, body').animate({scrollTop: 0}, 500);
  });

  today_start = get_today_start();
  
  // Initialize the datepicker.
  $('#datepicker').datepicker({
          firstDay: 1,
          dateFormat: '@',  //@=ms since 01/01/1970.
          minDate: new Date(min_time * 1000),
          maxDate: 7,
          defaultDate: new Date(today_start * 1000),
          onSelect: function(val, inst) {
                  if (isBusyR || isBusyW) {
                    log_stuff("UI is busy - not changing the date.");
                  } else {
                    // Get the chosen start time, rounded to midnight plus the TV day start, in seconds.
                    log_stuff("\ndatepicker.onSelect(" + new Date(Number(val)) + ")");
                    var chosen  = Math.round(val / 86400000.0) * 86400 + day_start;
                    request_update(chosen);
                  }
          }
  });
  log_stuff("Initialized the default datepicker time to " + new Date(today_start * 1000));

  // Load the cookie. Convert the string to boolean, but default to true if it's missing.
  // Set the initial checked state before initializing the iphoneStyle checkbox.
  including_live = getCookie("tvdiary_live_tv");
  including_live = (including_live != "false");
  if (including_live) {
    $('#include_live').attr("checked","checked").change();
  } else {
    $('#include_live').removeAttr("checked").change();
  }

  // Initialize the checkbox.
  $('#include_live').iphoneStyle({
    checkedLabel: 'Yes',
    uncheckedLabel: 'No'
  });
  $('#include_live').change(function() {
    // I can't get other methods, including is(":checked"), to work.
    show_live($(this).is('[checked=checked]'));
  });

  // Get the start of today, adjusted for the day start offset.
  function get_today_start() {
    // Counter-intuitively - *subtract* the day_start before rounding down to the start of the day, so that at 1am
    // we get yesterday's TV listings, but then add day_start back on so we get listings from the right start time.
    var today_start = Math.floor(((new Date().getTime() / 1000.0) - day_start) / 86400) * 86400 + day_start;
    log_stuff("get_today_start()=" + new Date(today_start * 1000) + "day_start=" + day_start);
    return today_start;
  }

  // Change whether watched live TV is shown.
  function show_live(state) {
    including_live = state;
    // Show or hide the rows.
    $( "#watched_inner tr.live_event" ).each(function( index ) {
      if (state) {
        $(this).addClass("visible_event").removeClass("hidden_event");
      } else {
        $(this).addClass("hidden_event").removeClass("visible_event");
      }
    });
    // Update the row colouring.
    apply_altrow( $("#watched_inner") );
    // Adjust how the heading is displayed.
    if (state) {
      $(".live_count").removeClass('live_count_hidden');
    } else {
      $(".live_count").addClass('live_count_hidden');
    }
    // Persist the setting.
    setCookie("tvdiary_live_tv", including_live);
  }

  // Update the alternating colour of rows beneath element "el", taking visibility into account.
  function apply_altrow(el) {
    $("tr.event_row.visible_event", el).each(function(i, tr) {
      if (i % 2) {
        $(tr).addClass('odd').removeClass('even');
      } else {
        $(tr).addClass('even').removeClass('odd');
      }
    });
  }

  // Ensure the data from Ajax has the necessary visibility classes before it's added to the DOM.
  function make_all_visible(data) {
    var jqd = $(data);
    $('tr.event_row', jqd).each(function(i, tr) {
      $(tr).addClass('visible_event').removeClass('hidden_event');
    });
    return jqd;
  }

  // Calculate the duration for one row, constrained by the display range.
  // NB durations are all in minutes, times are in seconds.
  function duration_within_display_range(tr) {
    var start = $(tr).attr('event_start');
    var end = $(tr).attr('event_end');
    if (start < display_start) {
      return Math.round((end - display_start) / 60);
    } else if (end > display_end) {
      return Math.round((display_end - start) / 60);
    } else {
      return Math.round((end - start) / 60);
    }    
  }

  // Format an integer like "04".  
  function two_digits(num) {
    var ret = String(num);
    if (ret.length < 2) {ret = "0" + ret;}
    return ret;
  }

  // Format a duration as hours:minutes like "2:04"
  function format_duration(duration) {
    return Math.floor(duration / 60) + ":" + two_digits(duration % 60);
  }

  // Upon loading the recorded data, count the recorded & scheduled durations & update the heading.
  function update_recorded_duration(el) {
    var total_recorded = 0;
    var total_scheduled = 0;
    // Nothing rather than total == 0 allows 0:00 at date changeovers.
    var nothing_recorded = true;
    var nothing_scheduled = true;

    $("table", el).each(function(i, tab) {
      var current_time = Number($(tab).attr('current_time'));
      var time_start = Number($(tab).attr('time_start'));
      var time_end = Number($(tab).attr('time_end'));
      log_stuff("update_recorded_duration() server times: current_time=" + new Date(current_time*1000) + ", time_start=" + new Date(time_start*1000) + ", time_end=" + new Date(time_end*1000));
    });

    $("tr.record_event", el).each(function(i, tr) {
      var constrained_duration = duration_within_display_range(tr);
      total_recorded += constrained_duration;
      nothing_recorded = false;
    });

    $("tr.future_event", el).each(function(i, tr) {
      var constrained_duration = duration_within_display_range(tr);
      total_scheduled += constrained_duration;
      nothing_scheduled = false;
    });

    // Add on the remaining time for active recordings
    $("tr.record_event.active_event", el).each(function(i, tr) {
      var now_time = Math.round(new Date().getTime() / 1000);
      var scheduled_end = Number($(tr).attr('scheduled_end'));
      var constrained_duration = 0;
      if (now_time < display_start) {
        // Now is before the range - only include time from the range start to scheduled end.
        constrained_duration = Math.ceil((scheduled_end - display_start) / 60);

      } else if (now_time > display_end) {
        // Now is after the range - nothing to include, it's all tomorrow.
        constrained_duration = 0;

      } else if (scheduled_end > display_end) {
        // Now is near the end of day, within range - include from now to the range end.
        constrained_duration = Math.ceil((display_end - now_time) / 60);

      } else {
        // Now must be near the start of day, within range - include from now to the scheduled end.
        constrained_duration = Math.ceil((scheduled_end - now_time) / 60);

      }
      log_stuff("update_recorded_duration() recording time for constrained_duration=" + constrained_duration + ", now_time=" + new Date(now_time*1000) + " scheduled_end=" + new Date(scheduled_end*1000) + ", display_start=" + new Date(display_start*1000) + ", display_end=" + new Date(display_end*1000));
      if (constrained_duration < 0) {
        alert("constrained_duration=" + constrained_duration);
      }
      total_scheduled += constrained_duration;
      nothing_scheduled = false;
    });

    if (display_start < today_start) {
      if (nothing_recorded) {
        $('#recorded_caption').html( "Recorded nothing");
      } else {
        $('#recorded_caption').html( "Recorded - " + format_duration(total_recorded));
      }
    } else if (display_start > today_start) {
      if (nothing_scheduled) {
        $('#recorded_caption').html( "Nothing to be recorded");
      } else {
        $('#recorded_caption').html( "To be recorded - " + format_duration(total_scheduled));
      }
    } else {
      if (nothing_recorded && nothing_scheduled) {
        $('#recorded_caption').html( "Recorded nothing");
      } else if (nothing_recorded) {
        $('#recorded_caption').html( "To be recorded - " + format_duration(total_scheduled));
      } else if (nothing_scheduled) {
        $('#recorded_caption').html( "Recorded - " + format_duration(total_recorded));
      } else {
        $('#recorded_caption').html( "Recorded - " + format_duration(total_recorded) + " / To be recorded - " + format_duration(total_scheduled));
      }
    }
    log_stuff("Recorded caption now=" + new Date() + ", update_recorded_duration() display_start=" + new Date(display_start*1000) + ", today_start=" + new Date(today_start*1000) + ", total_recorded=" + total_recorded + ", total_scheduled=" + total_scheduled + ", set caption to=" + $('#recorded_caption').html());
  }
  
  // Upon loading the watched data, count the played & live durations & update the heading.
  function update_watched_duration(el) {
    var total_played = 0;
    var total_live = 0;
    // Nothing rather than total == 0 allows 0:00 at date changeovers.
    var nothing_played = true;
    var nothing_live = true;

    $("tr.play_event", el).each(function(i, tr) {
      var constrained_duration = duration_within_display_range(tr);
      total_played += constrained_duration;
      nothing_played = false;
    });

    $("tr.live_event", el).each(function(i, tr) {
      var constrained_duration = duration_within_display_range(tr);
      total_live += constrained_duration;
      nothing_live = false;
    });

    var combined_duration = total_played + total_live;
    
    if (nothing_played && nothing_live) {
      $('#watched_caption').html( "Watched nothing");
    } else if (nothing_live) {
      $('#watched_caption').html( "Watched - " + format_duration(combined_duration) + " (Media: " + format_duration(total_played) + ")");
    } else if (nothing_played) {
      $('#watched_caption').html( "Watched - " + format_duration(combined_duration) + " (<span class=\"live_count\">Live: " + format_duration(total_live) + "<span>)");
    } else {
      $('#watched_caption').html( "Watched - " + format_duration(combined_duration) + " (Media: " + format_duration(total_played) + " / <span class=\"live_count\">Live: " + format_duration(total_live) + "</span>)");
    }
    // I'd liked to have put the checkox in the heading it refers to, but it's too big.
    // So instead, make clicking the live time control the checkbox to allow direct manipulation.
    $(".live_count").click(function(){
      if (!including_live) {
        $('#include_live').attr("checked","checked").change();
      } else {
        $('#include_live').removeAttr("checked").change();
      }
    });
  }

  // When the date selection changes, request new recorded & watched tables.
  function request_update(chosen) {
    today_start = get_today_start()
    display_start = chosen;
    display_end = display_start + 86400;
    log_stuff("request_update today_start=" + new Date(today_start*1000) + ", display_start=" + new Date(display_start * 1000) + ", display_end=" + new Date(display_end * 1000));

    // Main page heading.
    $('#title_date').html( " - " + $.datepicker.formatDate("d MM yy", new Date(display_start * 1000)) );

    // Blank the tables and show progress indicators.
    $('#recorded_inner').html("");
    $('#recorded_spinner').show('fast');
    $('#watched_inner').html("");
    $('#watched_spinner').show('fast');

    // Temporary table headings.
    if (display_start < today_start) {
      $('#recorded_caption').html( "Recorded" );
    } else if (display_start > today_start) {
      $('#recorded_caption').html( "To be recorded" );
    } else {
      $('#recorded_caption').html( "Recorded / To be recorded" );
    }
    $('#watched_caption').html( "Watched" );
    log_stuff("Temp caption now=" + new Date() + ", request_update(" + new Date(chosen*1000) + ") display_start=" + new Date(display_start*1000) + ", today_start=" + new Date(today_start*1000) + ", set caption to=" + $('#recorded_caption').html());

    // Pass the browser's time to the web server - helps when clocks aren't synced.
    var now_time = Math.round(new Date().getTime() / 1000);

    // Asynchronously request the recorded table data.
    isBusyR = true;
    $.ajax({
      type: "GET",
      dataType: "text",
      url: "/tvdiary/day_view.jim?start=" + display_start + "&current_time=" + now_time + "&type=R",
      success: function(data) {
        $('#recorded_inner').html(make_all_visible(data));
        apply_altrow($('#recorded_inner'));
        update_recorded_duration($('#recorded_inner'));
        $('#recorded_spinner').hide('slow');
        isBusyR = false;
      },
      error: function(_, _, e) {
        if (window.console) {
          log_stuff("ajax error " + e);
        }
        $('#recorded_inner').html("<span class=\"nothing\">Sorry, unavailable due to server error</span>");
        $('#recorded_spinner').hide('slow');
        isBusyR = false;
      }
    });
    
    // Asynchronously request the watched table data.
    isBusyW = true;
    $.ajax({
      type: "GET",
      dataType: "text",
      url: "/tvdiary/day_view.jim?start=" + display_start + "&current_time=" + now_time + "&type=W",
      success: function(data) {
        $('#watched_inner').html(make_all_visible(data));
        update_watched_duration( $('#watched_inner') );
        show_live(including_live);
        $('#watched_spinner').hide('slow');
        isBusyW = false;
      },
      error: function(_, _, e) {
        if (window.console) {
          log_stuff("ajax error " + e);
        }
        $('#watched_inner').html("<span class=\"nothing\">Sorry, unavailable due to server error</span>");
        $('#watched_spinner').hide('slow');
        isBusyW = false;
      }
    });
  }

  // Save a cookie for a year.
  function setCookie(c_name, value) {
    var exdate = new Date();
    exdate.setDate(exdate.getDate() + 365);
    var c_value = escape(value) + "; expires=" + exdate.toUTCString();
    document.cookie = c_name + "=" + c_value;
  }

  // Read a cookie. Returns a string.
  function getCookie(c_name) {
    var c_value = document.cookie;
    var c_start = c_value.indexOf(" " + c_name + "=");
    if (c_start == -1) {
      c_start = c_value.indexOf(c_name + "=");
    }
    if (c_start == -1) {
      c_value = null;
    } else {
      c_start = c_value.indexOf("=", c_start) + 1;
      var c_end = c_value.indexOf(";", c_start);
      if (c_end == -1) {
        c_end = c_value.length;
      }
      c_value = unescape(c_value.substring(c_start,c_end));
    }
    return c_value;
  }

  // Last thing to do when the page loads: show today's details.
  request_update(today_start);
});
