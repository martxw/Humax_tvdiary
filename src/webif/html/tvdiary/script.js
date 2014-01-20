/*
 * TV Diary main display page scripts.
 * Author: Martin Wink, 2013.
 */

// calendar_params.js/jim must be included prior to this.
// day_start seconds offset to the start of the TV day.
// min_time time of the earliest available information.
// max_time time of the latest available information.
// shapshot_time defined only for a published snapshot.
//

// Declare globals

// Today's calendar date start.
// Counter-intuitively - *subtract* the day_start before rounding down to the start of the day, so that at 1am
// we get yesterday's TV listings, but then add day_start back on so we get listings from the right start time.
var today_start;
if (typeof shapshot_time == "undefined") {
  today_start = Math.floor(((new Date().getTime() / 1000.0) - day_start) / 86400) * 86400 + day_start;
} else {
  today_start = Math.floor((shapshot_time - day_start) / 86400) * 86400 + day_start;
}

// Whether live broadcasts are to be displayed. Toggled on and off.
var including_live = true;

// Start time for the displayed details, with the day_start offset included. Changed by the datepicker.
var request_start;

// While awaiting Ajax responses.
var isBusyR = false;
var isBusyW = false;

function log_stuff(x) {
  /*console.log(x);*/
  $.get("/tvdiary/jslog.jim?msg=" + encodeURI(x));
}

$(document).ready(function() {

  // Initialize the to-top scroller.
  $().UItoTop({easingType: 'easeOutQuart'});
  $('.backtotop').click(function() {
    $('html, body').animate({scrollTop: 0}, 500);
  });

  // Initialize the datepicker.
  $('#datepicker').datepicker({
          firstDay: 1,
          dateFormat: '@',  //@=ms since 01/01/1970.
          minDate: new Date(min_time * 1000),
          maxDate: new Date(max_time * 1000),
          defaultDate: new Date(today_start * 1000),
          onSelect: function(val, inst) {
                  if (isBusyR || isBusyW) {
                    log_stuff("UI is busy - not changing the date to " + new Date(Number(val)) + " - restoring " + new Date(request_start*1000) +".");
                    $('#datepicker').datepicker("setDate", new Date(request_start * 1000));
                  } else {
                    // Get the chosen start time, rounded to midnight plus the TV day start, in seconds.
                    log_stuff("datepicker.onSelect(" + new Date(Number(val)) + ")");
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

  $('#prev_day').button()
    .click(function() {
      updateDate(-1);
    });
  $('#today').button()
    .click(function() {
      updateDate(0);
    });
  $('#next_day').button()
    .click(function() {
      updateDate(+1);
    });
  
  // Process the button date changes
  function updateDate(direction) {
    if (!(isBusyR || isBusyW)) {
      var currentDate = $('#datepicker').datepicker( "getDate" );
      var newTime = currentDate.getTime();
      if (direction < 0) {
        newTime -= 86400000;
      } else if (direction > 0) {
        newTime += 86400000;
      } else {
        newTime = today_start * 1000;
      }
      if (newTime >= (min_time * 1000) && newTime <= (max_time * 1000)) {
        currentDate.setTime(newTime);
        $('#datepicker').datepicker("setDate", currentDate);

        // Get the chosen start time, rounded to midnight plus the TV day start, in seconds.
        log_stuff("Simulated datepicker.onSelect(" + currentDate + ")");
        var chosen  = Math.round(newTime / 86400000.0) * 86400 + day_start;
        request_update(chosen);
      }
    }
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
  function duration_within_display_range(tr, time_start, time_end) {
    var start = $(tr).attr('event_start');
    var end = $(tr).attr('event_end');
    if (start < time_start) {
      return Math.round((end - time_start) / 60);
    } else if (end > time_end) {
      return Math.round((time_end - start) / 60);
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

    // Calculate based on the time range from the table, not what was requested.
    var report_time = 0;
    var report_day_start = 0;
    var table_time_start = 0;
    var table_time_end = 0;
    $("table", el).each(function(i, tab) {
      report_time = Number($(tab).attr('current_time'));
      report_day_start = Math.floor((report_time - day_start) / 86400) * 86400 + day_start;
      table_time_start = Number($(tab).attr('time_start'));
      table_time_end = Number($(tab).attr('time_end'));
      log_stuff("update_recorded_duration() server times: report_time=" + new Date(report_time * 1000) + ", table_time_start=" + new Date(table_time_start * 1000) + ", table_time_end=" + new Date(table_time_end * 1000));
    });

    $("tr.record_event", el).each(function(i, tr) {
      var constrained_duration = duration_within_display_range(tr, table_time_start, table_time_end);
      total_recorded += constrained_duration;
      nothing_recorded = false;
    });

    $("tr.future_event", el).each(function(i, tr) {
      var constrained_duration = duration_within_display_range(tr, table_time_start, table_time_end);
      total_scheduled += constrained_duration;
      nothing_scheduled = false;
    });

    // Add on the remaining time for active recordings
    $("tr.record_event.active_event", el).each(function(i, tr) {
      var scheduled_end = Number($(tr).attr('scheduled_end'));
      var constrained_duration = 0;
      if (report_time < table_time_start) {
        // Now is before the range - only include time from the range start to scheduled end.
        constrained_duration = Math.ceil((scheduled_end - table_time_start) / 60);

      } else if (report_time > table_time_end) {
        // Now is after the range - nothing to include, it's all tomorrow.
        constrained_duration = 0;

      } else if (scheduled_end > table_time_end) {
        // Now is near the end of day, within range - include from now to the range end.
        constrained_duration = Math.ceil((table_time_end - report_time) / 60);

      } else {
        // Now must be near the start of day, within range - include from now to the scheduled end.
        constrained_duration = Math.ceil((scheduled_end - report_time) / 60);

      }
      log_stuff("update_recorded_duration() recording time for constrained_duration=" + constrained_duration + ", report_time=" + new Date(report_time * 1000) + " scheduled_end=" + new Date(scheduled_end * 1000) + ", table_time_start=" + new Date(table_time_start * 1000) + ", table_time_end=" + new Date(table_time_end * 1000));
      if (constrained_duration < 0) {
        log_stuff("ALERT: constrained_duration=" + constrained_duration);
        alert("constrained_duration=" + constrained_duration);
      }
      total_scheduled += constrained_duration;
      nothing_scheduled = false;
    });

    if (table_time_start < report_day_start) {
      if (nothing_recorded) {
        $('#recorded_caption').html( "Recorded nothing");
      } else {
        $('#recorded_caption').html( "Recorded - " + format_duration(total_recorded));
      }
    } else if (table_time_start > report_day_start) {
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
    log_stuff("Recorded caption now=" + new Date() + ", update_recorded_duration() table_time_start=" + new Date(table_time_start*1000) + ", report_day_start=" + new Date(report_day_start*1000) + ", total_recorded=" + total_recorded + ", total_scheduled=" + total_scheduled + ", set caption to=" + $('#recorded_caption').html());
  }
  
  // Upon loading the watched data, count the played & live durations & update the heading.
  function update_watched_duration(el) {
    var total_played = 0;
    var total_live = 0;
    // Nothing rather than total == 0 allows 0:00 at date changeovers.
    var nothing_played = true;
    var nothing_live = true;

    // Calculate based on the time range from the table, not what was requested.
    var report_time;
    var table_time_start;
    var table_time_end;
    $("table", el).each(function(i, tab) {
      report_time = Number($(tab).attr('current_time'));
      table_time_start = Number($(tab).attr('time_start'));
      table_time_end = Number($(tab).attr('time_end'));
      log_stuff("update_recorded_duration() server times: report_time=" + new Date(report_time * 1000) + ", table_time_start=" + new Date(table_time_start * 1000) + ", table_time_end=" + new Date(table_time_end * 1000));
    });

    $("tr.play_event", el).each(function(i, tr) {
      var constrained_duration = duration_within_display_range(tr, table_time_start, table_time_end);
      total_played += constrained_duration;
      nothing_played = false;
    });

    $("tr.live_event", el).each(function(i, tr) {
      var constrained_duration = duration_within_display_range(tr, table_time_start, table_time_end);
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
    request_start = chosen;
    log_stuff("request_update today_start=" + new Date(today_start * 1000) + ", request_start=" + new Date(request_start * 1000));

    // Main page heading.
    $('#title_date').html( " - " + $.datepicker.formatDate("d MM yy", new Date(request_start * 1000)) );

    // Blank the tables and show progress indicators.
    $('#recorded_inner').html("");
    $('#recorded_spinner').show('fast');
    $('#watched_inner').html("");
    $('#watched_spinner').show('fast');

    // Temporary table headings.
    if (request_start < today_start) {
      $('#recorded_caption').html( "Recorded" );
    } else if (request_start > today_start) {
      $('#recorded_caption').html( "To be recorded" );
    } else {
      $('#recorded_caption').html( "Recorded / To be recorded" );
    }
    $('#watched_caption').html( "Watched" );
    log_stuff("Temp caption now=" + new Date() + ", request_update(" + new Date(chosen * 1000) + ") request_start=" + new Date(request_start * 1000) + ", today_start=" + new Date(today_start * 1000) + ", set caption to=" + $('#recorded_caption').html());

    var r_url;
    var w_url;
    if (typeof shapshot_time == "undefined") {
      // Pass the browser's time to the web server - helps when clocks aren't synced.
      var now_time = Math.round(new Date().getTime() / 1000);
      r_url = "/tvdiary/day_view.jim?start=" + request_start + "&current_time=" + now_time + "&type=R";
      w_url = "/tvdiary/day_view.jim?start=" + request_start + "&current_time=" + now_time + "&type=W";
    } else {
      var date_filename = $.datepicker.formatDate("yy_mm_dd", new Date(request_start * 1000));
      r_url = "/tvdiary/" + date_filename + "_R.html?nocache";
      w_url = "/tvdiary/" + date_filename + "_W.html?nocache";
    }

    // Asynchronously request the recorded table data.
    isBusyR = true;
    $.ajax({
      type: "GET",
      dataType: "text",
      // For standalone page only
      url: r_url,
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
      url: w_url,
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
